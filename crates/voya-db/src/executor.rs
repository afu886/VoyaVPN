use sqlx::{Sqlite, SqlitePool, Transaction};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Copy)]
pub(crate) enum RepositoryExecutor<'executor> {
    Pool(&'executor SqlitePool),
    Transaction(&'executor Mutex<Transaction<'static, Sqlite>>),
}

macro_rules! run_query {
    ($executor:expr, $query:expr, $method:ident) => {{
        let query = $query;
        match $executor {
            $crate::executor::RepositoryExecutor::Pool(pool) => query.$method(pool).await,
            $crate::executor::RepositoryExecutor::Transaction(transaction) => {
                let mut transaction = transaction.lock().await;
                query.$method(&mut **transaction).await
            }
        }
    }};
}

pub(crate) use run_query;
