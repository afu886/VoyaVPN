use super::{ProcessError, ProcessHandle};

pub trait ProcessJob: Send {
    fn assign(&mut self, handle: &ProcessHandle) -> Result<(), ProcessError>;
}

pub trait ProcessJobFactory: Send + Sync {
    fn create_job(&self) -> Result<Option<Box<dyn ProcessJob>>, ProcessError>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct NoopProcessJobFactory;

impl ProcessJobFactory for NoopProcessJobFactory {
    fn create_job(&self) -> Result<Option<Box<dyn ProcessJob>>, ProcessError> {
        Ok(None)
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct PlatformProcessJobFactory;

impl ProcessJobFactory for PlatformProcessJobFactory {
    fn create_job(&self) -> Result<Option<Box<dyn ProcessJob>>, ProcessError> {
        platform_process_job()
    }
}

#[cfg(windows)]
fn platform_process_job() -> Result<Option<Box<dyn ProcessJob>>, ProcessError> {
    windows_job::WindowsProcessJob::new().map(|job| Some(Box::new(job) as Box<dyn ProcessJob>))
}

#[cfg(not(windows))]
fn platform_process_job() -> Result<Option<Box<dyn ProcessJob>>, ProcessError> {
    Ok(None)
}

#[cfg(windows)]
mod windows_job {
    use std::{ffi::c_void, mem, ptr};

    use super::{ProcessError, ProcessHandle, ProcessJob};

    type Handle = *mut c_void;

    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: u32 = 9;
    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x2000;
    const PROCESS_TERMINATE: u32 = 0x0001;
    const PROCESS_SET_QUOTA: u32 = 0x0100;

    #[repr(C)]
    struct IoCounters {
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
    }

    #[repr(C)]
    struct JobObjectBasicLimitInformation {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
    }

    #[repr(C)]
    struct JobObjectExtendedLimitInformation {
        basic_limit_information: JobObjectBasicLimitInformation,
        io_info: IoCounters,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_used: usize,
        peak_job_memory_used: usize,
    }

    extern "system" {
        fn CreateJobObjectW(attributes: Handle, name: *const u16) -> Handle;
        fn SetInformationJobObject(
            job: Handle,
            info_class: u32,
            info: *const c_void,
            info_length: u32,
        ) -> i32;
        fn AssignProcessToJobObject(job: Handle, process: Handle) -> i32;
        fn OpenProcess(desired_access: u32, inherit_handle: i32, process_id: u32) -> Handle;
        fn CloseHandle(handle: Handle) -> i32;
    }

    pub struct WindowsProcessJob {
        handle: Handle,
    }

    // SAFETY: the job handle is an owned kernel handle. Access is synchronized
    // by the owning supervisor and Windows permits handles to cross threads.
    unsafe impl Send for WindowsProcessJob {}

    impl WindowsProcessJob {
        pub fn new() -> Result<Self, ProcessError> {
            // SAFETY: all pointers passed to the Windows job APIs are either
            // null by contract or point to initialized values for the call.
            unsafe {
                let handle = CreateJobObjectW(ptr::null_mut(), ptr::null());
                if handle.is_null() {
                    return Err(ProcessError::Job("CreateJobObjectW failed".to_string()));
                }

                let mut info: JobObjectExtendedLimitInformation = mem::zeroed();
                info.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let ok = SetInformationJobObject(
                    handle,
                    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
                    (&info as *const JobObjectExtendedLimitInformation).cast::<c_void>(),
                    size_of::<JobObjectExtendedLimitInformation>() as u32,
                );
                if ok == 0 {
                    let _ = CloseHandle(handle);
                    return Err(ProcessError::Job(
                        "SetInformationJobObject failed".to_string(),
                    ));
                }

                Ok(Self { handle })
            }
        }
    }

    impl ProcessJob for WindowsProcessJob {
        fn assign(&mut self, handle: &ProcessHandle) -> Result<(), ProcessError> {
            // SAFETY: `handle.id()` is used only to open a process handle; the
            // returned handle is checked for null and closed exactly once.
            unsafe {
                let process = OpenProcess(PROCESS_TERMINATE | PROCESS_SET_QUOTA, 0, handle.id());
                if process.is_null() {
                    return Err(ProcessError::Job(format!(
                        "OpenProcess failed for pid {}",
                        handle.id()
                    )));
                }

                let ok = AssignProcessToJobObject(self.handle, process);
                let _ = CloseHandle(process);
                if ok == 0 {
                    return Err(ProcessError::Job(format!(
                        "AssignProcessToJobObject failed for pid {}",
                        handle.id()
                    )));
                }
            }
            Ok(())
        }
    }

    impl Drop for WindowsProcessJob {
        fn drop(&mut self) {
            // SAFETY: `self.handle` is owned by this value, checked for null,
            // and cleared immediately after the single CloseHandle call.
            unsafe {
                if !self.handle.is_null() {
                    let _ = CloseHandle(self.handle);
                    self.handle = ptr::null_mut();
                }
            }
        }
    }
}
