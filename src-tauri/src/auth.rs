use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand_core::OsRng;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::database::DatabaseState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterInput {
    name: String,
    email: String,
    password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginInput {
    email: String,
    password: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    id: String,
    name: String,
    email: String,
}

#[tauri::command]
pub fn register_user(
    state: State<'_, DatabaseState>,
    input: RegisterInput,
) -> Result<AuthUser, String> {
    let name = input.name.trim();
    let email = normalize_email(&input.email)?;
    validate_name(name)?;
    validate_password(&input.password)?;

    let connection = state.connect().map_err(internal_error)?;
    let exists = connection
        .query_row(
            "SELECT 1 FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1",
            [&email],
            |_| Ok(()),
        )
        .optional()
        .map_err(internal_error)?
        .is_some();

    if exists {
        return Err("Ya existe una cuenta con ese correo.".to_string());
    }

    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(input.password.as_bytes(), &salt)
        .map_err(internal_error)?
        .to_string();
    let id = Uuid::new_v4().to_string();

    connection
        .execute(
            "INSERT INTO users (id, name, email, password_hash) VALUES (?1, ?2, ?3, ?4)",
            params![id, name, email, password_hash],
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE constraint failed") {
                "Ya existe una cuenta con ese correo.".to_string()
            } else {
                internal_error(error)
            }
        })?;

    Ok(AuthUser {
        id,
        name: name.to_string(),
        email,
    })
}

#[tauri::command]
pub fn login_user(state: State<'_, DatabaseState>, input: LoginInput) -> Result<AuthUser, String> {
    let email = normalize_email(&input.email)?;
    let connection = state.connect().map_err(internal_error)?;

    let user = connection
        .query_row(
            "SELECT id, name, email, password_hash FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1",
            [&email],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()
        .map_err(internal_error)?;

    let Some((id, name, stored_email, password_hash)) = user else {
        return Err("Correo o contraseña incorrectos.".to_string());
    };

    let parsed_hash = PasswordHash::new(&password_hash).map_err(internal_error)?;
    if Argon2::default()
        .verify_password(input.password.as_bytes(), &parsed_hash)
        .is_err()
    {
        return Err("Correo o contraseña incorrectos.".to_string());
    }

    Ok(AuthUser {
        id,
        name,
        email: stored_email,
    })
}

fn normalize_email(value: &str) -> Result<String, String> {
    let email = value.trim().to_lowercase();
    let valid = email.len() <= 254
        && email.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty() && domain.contains('.') && !domain.ends_with('.')
        });

    if valid {
        Ok(email)
    } else {
        Err("Introduce un correo válido.".to_string())
    }
}

fn validate_name(value: &str) -> Result<(), String> {
    if (2..=80).contains(&value.chars().count()) {
        Ok(())
    } else {
        Err("El nombre debe tener entre 2 y 80 caracteres.".to_string())
    }
}

fn validate_password(value: &str) -> Result<(), String> {
    if value.chars().count() < 8 {
        Err("La contraseña debe tener al menos 8 caracteres.".to_string())
    } else if value.chars().count() > 128 {
        Err("La contraseña no puede superar 128 caracteres.".to_string())
    } else {
        Ok(())
    }
}

fn internal_error(error: impl std::fmt::Display) -> String {
    tracing::error!("local auth error: {error}");
    "No se pudo completar la operación local.".to_string()
}

#[cfg(test)]
mod tests {
    use super::{normalize_email, validate_password};

    #[test]
    fn normalizes_valid_email_addresses() {
        assert_eq!(
            normalize_email("  USER@Example.COM  ").unwrap(),
            "user@example.com"
        );
        assert!(normalize_email("invalid-address").is_err());
    }

    #[test]
    fn enforces_password_length_limits() {
        assert!(validate_password("1234567").is_err());
        assert!(validate_password("safe-passphrase").is_ok());
        assert!(validate_password(&"a".repeat(129)).is_err());
    }
}
