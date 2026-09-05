use std::fmt;

#[derive(Debug)]
pub enum DomainError {
    InvalidInput(&'static str),
    Json(serde_json::Error),
}

impl fmt::Display for DomainError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInput(message) => f.write_str(message),
            Self::Json(_) => f.write_str("資料格式不正確"),
        }
    }
}

impl std::error::Error for DomainError {}

impl From<serde_json::Error> for DomainError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

pub(crate) fn finite(value: f64) -> Result<f64, DomainError> {
    if value.is_finite() {
        Ok(value)
    } else {
        Err(DomainError::InvalidInput("數值超過允許範圍"))
    }
}
