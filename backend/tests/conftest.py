import os
import tempfile

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="kiln-test-"))
