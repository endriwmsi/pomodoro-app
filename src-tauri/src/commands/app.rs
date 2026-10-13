use serde::Serialize;

/// Identificação do aplicativo exibida em Configurações → Sobre.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

impl AppInfo {
    fn from_package(info: &tauri::PackageInfo) -> Self {
        Self {
            name: info.name.clone(),
            version: info.version.to_string(),
        }
    }
}

/// Retorna o nome do produto e a versão do pacote em execução.
#[tauri::command]
pub fn app_info(app: tauri::AppHandle) -> AppInfo {
    AppInfo::from_package(app.package_info())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn package(name: &str, version: &str) -> tauri::PackageInfo {
        tauri::PackageInfo {
            name: name.into(),
            version: version.parse().expect("versão semver válida"),
            authors: "",
            description: "",
            crate_name: "compasso",
        }
    }

    #[test]
    fn app_info_reflects_package_metadata() {
        let info = AppInfo::from_package(&package("Compasso", "1.2.3"));

        assert_eq!(info.name, "Compasso");
        assert_eq!(info.version, "1.2.3");
    }

    #[test]
    fn app_info_serializes_with_the_frontend_contract() {
        let info = AppInfo::from_package(&package("Compasso", "0.1.0"));

        let json = serde_json::to_value(&info).expect("AppInfo é serializável");

        assert_eq!(
            json,
            serde_json::json!({ "name": "Compasso", "version": "0.1.0" })
        );
    }
}
