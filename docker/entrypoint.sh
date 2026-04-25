#!/usr/bin/env bash
# docker/entrypoint.sh
#
# MODE env var controls behaviour:
#   MODE=test   -> migrate + seed + pytest, then exit  (default for test service)
#   MODE=server -> migrate + seed + runserver           (default for app service)

set -e

MODE="${MODE:-test}"

echo "======================================================"
echo "  Military eLearning Plugin"
echo "  Mode: ${MODE}"
echo "======================================================"

echo "[1/4] Waiting for PostgreSQL..."
until pg_isready -h "${DB_HOST:-db}" -p "${DB_PORT:-5432}" -U "${DB_USER:-military}" -q; do
  sleep 2
done
echo "  PostgreSQL is up ✓"

echo "[2/4] Waiting for Redis..."
until python -c "import redis; redis.Redis(host='${REDIS_HOST:-redis}').ping()" 2>/dev/null; do
  sleep 2
done
echo "  Redis is up ✓"

echo "[3/4] Running Django migrations..."
export DJANGO_SETTINGS_MODULE=settings_docker
python manage.py migrate --run-syncdb --no-input
echo "  Migrations done ✓"

echo "[4/4] Seeding demo data & registering filters..."
python manage.py seed_demo_data
echo "  Demo data ready ✓"

if [ "${MODE}" = "server" ]; then
  echo ""
  echo "  http://localhost:8080/admin/           (admin / admin1234)"
  echo "  http://localhost:8080/military/dashboard/"
  echo "  http://localhost:8080/military/reports/"
  echo "  http://localhost:8080/military/renewal/"
  echo "======================================================"
  exec python manage.py runserver 0.0.0.0:8080
else
  echo ""
  echo "  Running pytest..."
  echo "======================================================"
  pytest --tb=short -v --cov=. --cov-report=term-missing
fi
