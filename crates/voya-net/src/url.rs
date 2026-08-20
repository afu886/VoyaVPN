use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum UrlValidationError {
    #[error("expected an absolute HTTP or HTTPS URL")]
    InvalidHttpUrl,
    #[error("expected an absolute HTTPS URL")]
    InvalidHttpsUrl,
    #[error("embedded credentials are not allowed")]
    EmbeddedCredentials,
}

pub fn validate_absolute_https_url(value: &str) -> Result<(), UrlValidationError> {
    let parsed = reqwest::Url::parse(value).map_err(|_| UrlValidationError::InvalidHttpsUrl)?;
    if parsed.scheme() != "https" || parsed.host_str().is_none() {
        return Err(UrlValidationError::InvalidHttpsUrl);
    }
    validate_credentials(&parsed)
}

pub fn validate_absolute_http_url(value: &str) -> Result<(), UrlValidationError> {
    let parsed = reqwest::Url::parse(value).map_err(|_| UrlValidationError::InvalidHttpUrl)?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err(UrlValidationError::InvalidHttpUrl);
    }
    validate_credentials(&parsed)
}

fn validate_credentials(parsed: &reqwest::Url) -> Result<(), UrlValidationError> {
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(UrlValidationError::EmbeddedCredentials);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strict_https_urls_reject_plain_http_and_credentials() {
        validate_absolute_https_url("https://example.test/routing.json")
            .expect("absolute HTTPS URL should be accepted");
        assert_eq!(
            validate_absolute_https_url("http://example.test/routing.json"),
            Err(UrlValidationError::InvalidHttpsUrl)
        );
        assert_eq!(
            validate_absolute_https_url("https://user:secret@example.test/routing.json"),
            Err(UrlValidationError::EmbeddedCredentials)
        );
    }
}
