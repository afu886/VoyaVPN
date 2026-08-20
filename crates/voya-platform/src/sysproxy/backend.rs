use super::*;

fn custom_script_path(item: &SystemProxyItem) -> Option<PathBuf> {
    item.custom_system_proxy_script_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
        .map(PathBuf::from)
        .filter(|path| path.exists())
}

pub(super) fn linux_script_invocation(
    request: &SystemProxyRequest,
    mode: &str,
    manual: Option<(&str, i32, &str)>,
) -> ScriptInvocation {
    let (executable, generated_script) =
        if let Some(custom_script) = custom_script_path(&request.item) {
            (custom_script, None)
        } else {
            let executable = request.script_dir.join(LINUX_PROXY_SCRIPT_NAME);
            (
                executable.clone(),
                Some(GeneratedScript::new(
                    request.script_dir.clone(),
                    executable,
                    LINUX_PROXY_SCRIPT,
                    true,
                )),
            )
        };
    let mut arguments = vec![mode.to_string()];
    if let Some((host, port, exceptions)) = manual {
        arguments.push(host.to_string());
        arguments.push(port.to_string());
        arguments.push(exceptions.to_string());
    }

    ScriptInvocation {
        executable,
        arguments,
        generated_script,
    }
}

pub(super) fn macos_script_invocation(
    request: &SystemProxyRequest,
    mode: &str,
    manual: Option<(&str, i32, &str)>,
) -> ScriptInvocation {
    let (executable, generated_script) = macos_script_target(request);
    let mut arguments = vec![mode.to_string()];
    if let Some((host, port, exceptions)) = manual {
        arguments.push(host.to_string());
        arguments.push(port.to_string());
        arguments.extend(
            exceptions
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string),
        );
    }

    ScriptInvocation {
        executable,
        arguments,
        generated_script,
    }
}

pub(super) fn macos_pac_script_invocation(
    request: &SystemProxyRequest,
    pac_url: &str,
) -> ScriptInvocation {
    let (executable, generated_script) = macos_script_target(request);
    ScriptInvocation {
        executable,
        arguments: vec!["pac".to_string(), pac_url.to_string()],
        generated_script,
    }
}

fn macos_script_target(request: &SystemProxyRequest) -> (PathBuf, Option<GeneratedScript>) {
    if let Some(custom_script) = custom_script_path(&request.item) {
        (custom_script, None)
    } else {
        let executable = request.script_dir.join(MACOS_PROXY_SCRIPT_NAME);
        (
            executable.clone(),
            Some(GeneratedScript::new(
                request.script_dir.clone(),
                executable,
                MACOS_PROXY_SCRIPT,
                true,
            )),
        )
    }
}

pub(super) fn run_script(
    runner: &dyn ProcessRunner,
    script: &ScriptInvocation,
) -> Result<(), SystemProxyError> {
    let mut spawn = ProcessSpawn::new(ProcessRole::SysProxy, &script.executable)
        .with_arguments(script.arguments.clone());
    if let Some(generated_script) = script.generated_script.clone() {
        spawn = spawn.with_generated_script(generated_script);
    }
    ensure_success(runner.run_oneshot(spawn)?, "system proxy script")
}

pub(super) fn apply_windows_clear(runner: &dyn ProcessRunner) -> Result<(), SystemProxyError> {
    apply_windows_proxy(
        runner,
        &WindowsProxySettings {
            proxy: String::new(),
            exceptions: String::new(),
            option_type: WindowsProxyOption::Direct,
        },
    )
}

pub(super) fn apply_windows_proxy(
    runner: &dyn ProcessRunner,
    settings: &WindowsProxySettings,
) -> Result<(), SystemProxyError> {
    for command in windows_registry_commands(settings) {
        ensure_success(
            runner.run_oneshot(command)?,
            "windows registry proxy command",
        )?;
    }
    refresh_windows_internet_settings();
    Ok(())
}

fn windows_registry_commands(settings: &WindowsProxySettings) -> Vec<ProcessSpawn> {
    match settings.option_type {
        WindowsProxyOption::Direct => vec![
            registry_set_dword("ProxyEnable", 0),
            registry_set_string("ProxyServer", ""),
            registry_set_string("ProxyOverride", ""),
            registry_set_string("AutoConfigURL", ""),
        ],
        WindowsProxyOption::NamedProxy => vec![
            registry_set_dword("ProxyEnable", 1),
            registry_set_string("ProxyServer", &settings.proxy),
            registry_set_string("ProxyOverride", &settings.exceptions),
            registry_set_string("AutoConfigURL", ""),
        ],
        WindowsProxyOption::PacUrl => vec![
            registry_set_dword("ProxyEnable", 0),
            registry_set_string("ProxyServer", ""),
            registry_set_string("ProxyOverride", ""),
            registry_set_string("AutoConfigURL", &settings.proxy),
        ],
    }
}

fn registry_set_dword(name: &str, value: u32) -> ProcessSpawn {
    registry_set(name, "REG_DWORD", &value.to_string())
}

fn registry_set_string(name: &str, value: &str) -> ProcessSpawn {
    registry_set(name, "REG_SZ", value)
}

fn registry_set(name: &str, value_type: &str, value: &str) -> ProcessSpawn {
    ProcessSpawn::new(ProcessRole::SysProxy, "reg").with_arguments([
        "add".to_string(),
        WINDOWS_INTERNET_SETTINGS_REG_PATH.to_string(),
        "/v".to_string(),
        name.to_string(),
        "/t".to_string(),
        value_type.to_string(),
        "/d".to_string(),
        value.to_string(),
        "/f".to_string(),
    ])
}

#[cfg(windows)]
fn refresh_windows_internet_settings() {
    use std::ffi::c_void;

    const INTERNET_OPTION_REFRESH: u32 = 37;
    const INTERNET_OPTION_SETTINGS_CHANGED: u32 = 39;

    // `InternetSetOptionW` lives in wininet.dll, which is not one of the default
    // libraries the GNU/mingw linker pulls in (unlike kernel32). Without an
    // explicit link directive the test/binary link step fails with an undefined
    // reference. kernel32-only extern blocks elsewhere need no such attribute.
    #[link(name = "wininet")]
    extern "system" {
        fn InternetSetOptionW(
            internet: *mut c_void,
            option: u32,
            buffer: *mut c_void,
            buffer_length: u32,
        ) -> i32;
    }

    // SAFETY: both WinINet calls explicitly accept null handles and buffers for
    // these notification-only option values; no returned pointer is retained.
    unsafe {
        let _ = InternetSetOptionW(
            std::ptr::null_mut(),
            INTERNET_OPTION_SETTINGS_CHANGED,
            std::ptr::null_mut(),
            0,
        );
        let _ = InternetSetOptionW(
            std::ptr::null_mut(),
            INTERNET_OPTION_REFRESH,
            std::ptr::null_mut(),
            0,
        );
    }
}

#[cfg(not(windows))]
fn refresh_windows_internet_settings() {}

fn ensure_success(output: ProcessOutput, context: &'static str) -> Result<(), SystemProxyError> {
    if output.status_code == Some(0) {
        Ok(())
    } else {
        Err(SystemProxyError::CommandFailed {
            context,
            status_code: output.status_code,
            stderr: output.stderr,
        })
    }
}

pub(super) fn pac_http_response(config: &PacStartConfig) -> Result<Vec<u8>, SystemProxyError> {
    let pac_text = load_pac_text(config)?.replace(
        "__PROXY__",
        &format!("PROXY {LOOPBACK}:{};DIRECT;", config.http_port),
    );
    let mut response = String::new();
    response.push_str("HTTP/1.0 200 OK\r\n");
    response.push_str("Content-type:application/x-ns-proxy-autoconfig\r\n");
    response.push_str("Connection:close\r\n");
    response.push_str(&format!("Content-Length:{}\r\n", pac_text.len()));
    response.push_str("\r\n");
    response.push_str(&pac_text);

    Ok(response.into_bytes())
}

fn load_pac_text(config: &PacStartConfig) -> Result<String, SystemProxyError> {
    if let Some(custom) = config
        .custom_pac_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
        .map(PathBuf::from)
        .filter(|path| path.exists())
    {
        return fs::read_to_string(&custom).map_err(|source| SystemProxyError::PacRead {
            path: custom,
            source,
        });
    }

    fs::create_dir_all(&config.config_dir).map_err(|source| SystemProxyError::PacWrite {
        path: config.config_dir.clone(),
        source,
    })?;
    let path = config.config_dir.join(PAC_FILE_NAME);
    if !path.exists() {
        fs::write(&path, DEFAULT_PAC_TEMPLATE).map_err(|source| SystemProxyError::PacWrite {
            path: path.clone(),
            source,
        })?;
    }

    fs::read_to_string(&path).map_err(|source| SystemProxyError::PacRead { path, source })
}

pub(super) fn write_pac_response(mut stream: TcpStream, content: &[u8]) {
    let _ = stream.write_all(content);
    let _ = stream.flush();
}

pub(super) fn to_u16_port(port: i32) -> Result<u16, SystemProxyError> {
    u16::try_from(port).map_err(|_| SystemProxyError::InvalidPort(port))
}

pub(super) const LINUX_PROXY_SCRIPT: &str = r#"#!/bin/sh
mode="$1"
host="$2"
port="$3"
ignore_hosts="$4"

array_from_csv() {
  if [ -z "$1" ]; then
    printf "[]"
    return
  fi
  old_ifs="$IFS"
  IFS=","
  result=""
  for value in $1; do
    trimmed="$(printf "%s" "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if [ -n "$trimmed" ]; then
      if [ -n "$result" ]; then
        result="$result,"
      fi
      result="$result'$trimmed'"
    fi
  done
  IFS="$old_ifs"
  printf "[%s]" "$result"
}

set_gnome() {
  if ! command -v gsettings >/dev/null 2>&1; then
    return
  fi
  gsettings set org.gnome.system.proxy mode "$mode"
  if [ "$mode" = "manual" ]; then
    for proto in http https ftp socks; do
      gsettings set "org.gnome.system.proxy.$proto" host "$host"
      gsettings set "org.gnome.system.proxy.$proto" port "$port"
    done
    gsettings set org.gnome.system.proxy ignore-hosts "$(array_from_csv "$ignore_hosts")"
  fi
}

set_kde() {
  if command -v kwriteconfig6 >/dev/null 2>&1; then
    kwriteconfig=kwriteconfig6
  elif command -v kwriteconfig5 >/dev/null 2>&1; then
    kwriteconfig=kwriteconfig5
  else
    return
  fi
  if [ "$mode" = "manual" ]; then
    "$kwriteconfig" --file kioslaverc --group "Proxy Settings" --key ProxyType 1
    "$kwriteconfig" --file kioslaverc --group "Proxy Settings" --key httpProxy "http://$host:$port"
    "$kwriteconfig" --file kioslaverc --group "Proxy Settings" --key httpsProxy "http://$host:$port"
    "$kwriteconfig" --file kioslaverc --group "Proxy Settings" --key ftpProxy "http://$host:$port"
    "$kwriteconfig" --file kioslaverc --group "Proxy Settings" --key socksProxy "http://$host:$port"
    "$kwriteconfig" --file kioslaverc --group "Proxy Settings" --key NoProxyFor "$ignore_hosts"
  else
    "$kwriteconfig" --file kioslaverc --group "Proxy Settings" --key ProxyType 0
  fi
  dbus-send --type=signal /KIO/Scheduler org.kde.KIO.Scheduler.reparseSlaveConfiguration string:"" >/dev/null 2>&1 || true
}

if [ "$mode" != "manual" ] && [ "$mode" != "none" ]; then
  echo "Usage: $0 manual <host> <port> <ignore_hosts> | none" >&2
  exit 1
fi

set_gnome
set_kde
"#;

const MACOS_PROXY_SCRIPT: &str = r#"#!/bin/sh
mode="$1"
host="$2"
port="$3"
pac_url="$2"
if [ "$mode" = "set" ]; then
  shift 3 2>/dev/null || true
fi

services="$(networksetup -listallnetworkservices | grep -v '^\*')"
printf "%s\n" "$services" | while IFS= read -r service; do
  [ -z "$service" ] && continue
  if [ "$mode" = "set" ]; then
    networksetup -setwebproxy "$service" "$host" "$port"
    networksetup -setsecurewebproxy "$service" "$host" "$port"
    networksetup -setsocksfirewallproxy "$service" "$host" "$port"
    networksetup -setproxybypassdomains "$service" "$@"
    networksetup -setautoproxystate "$service" off
  elif [ "$mode" = "pac" ]; then
    networksetup -setwebproxystate "$service" off
    networksetup -setsecurewebproxystate "$service" off
    networksetup -setsocksfirewallproxystate "$service" off
    networksetup -setautoproxyurl "$service" "$pac_url"
    networksetup -setautoproxystate "$service" on
  elif [ "$mode" = "clear" ]; then
    networksetup -setwebproxystate "$service" off
    networksetup -setsecurewebproxystate "$service" off
    networksetup -setsocksfirewallproxystate "$service" off
    networksetup -setautoproxystate "$service" off
  else
    echo "Usage: $0 set <host> <port> [bypass...] | pac <url> | clear" >&2
    exit 1
  fi
done
"#;
