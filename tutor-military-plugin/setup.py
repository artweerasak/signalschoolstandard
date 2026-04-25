from setuptools import setup, find_packages

setup(
    name="tutor-military-plugin",
    version="1.0.0",
    description="Tutor plugin สำหรับระบบ eLearning ทหาร (Military edX Plugin)",
    author="Military eLearning Team",
    python_requires=">=3.8",
    install_requires=[
        "tutor>=17.0.0",   # Sumac / Redwood
    ],
    py_modules=["plugin"],
    entry_points={
        "tutor.plugin.v1": [
            "military = plugin",
        ],
    },
)
