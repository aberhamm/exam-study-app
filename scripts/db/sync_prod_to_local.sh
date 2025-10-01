# .env (keep outside VCS)
# PROD_URI="mongodb+srv://user:pass@cluster.xxx.mongodb.net/prod?retryWrites=true&w=majority"
# LOCAL_URI="mongodb://localhost:27017"
# DB_NAME="myprod"             # prod db name
# LOCAL_DB_NAME="myprod_local" # local db name (can be same as prod)

set -euo pipefail
source .env

mongodump \
  --uri="$PROD_URI" \
  --db="$DB_NAME" \
  --readPreference=secondaryPreferred \
  --numParallelCollections=4 \
| mongorestore \
  --uri="$LOCAL_URI" \
  --nsFrom="$DB_NAME.*" \
  --nsTo="$LOCAL_DB_NAME.*" \
  --drop
