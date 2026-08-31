from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "水下机器人团队成员画像系统 API"
    database_url: str = "sqlite:///./robot_team.db"
    cors_origins: str = "http://localhost:3000"
    ai_provider: str = "mock"
    ai_base_url: str = ""
    ai_api_key: str = ""
    ai_model: str = ""
    auth_secret: str = "robot-team-local-dev-secret"
    material_storage_dir: str = "./private_uploads"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
