import os
import tempfile

# до импорта app: локальное хранилище во временной папке, без LLM и сети
os.environ["LOCAL_DATA_DIR"] = tempfile.mkdtemp(prefix="limelight_test_")
os.environ["LLM_PROVIDER"] = "none"
os.environ.pop("SUPABASE_URL", None)
