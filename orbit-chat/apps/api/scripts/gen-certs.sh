#!/usr/bin/env bash
# Local-development certificates for the Orbit stack. NOT for production.
#   bash apps/api/scripts/gen-certs.sh            (run from the repo root; writes ./certs and ./ca-private)
#   OUT_DIR=./certs CA_KEY_DIR=./ca-private bash apps/api/scripts/gen-certs.sh
#
# Creates one private CA and two certificates signed by it:
#   certs/redis.crt + redis.key   Redis server   (names: redis, localhost, 127.0.0.1)
#   certs/api.crt   + api.key     API HTTPS      (names: localhost, backend, 127.0.0.1)
#   certs/client.crt + client.key optional mTLS client certificate for the API -> Redis connection
#   certs/ca.crt                  the CA clients must trust (REDIS_TLS_CA_CERT_PATH, browser/curl --cacert)
# The CA private key goes to a separate folder so it is never mounted into a container.
set -euo pipefail

OUT_DIR="${OUT_DIR:-./certs}"
CA_KEY_DIR="${CA_KEY_DIR:-./ca-private}"
mkdir -p "$OUT_DIR" "$CA_KEY_DIR"

if [ ! -f "$CA_KEY_DIR/ca.key" ]; then
  openssl genrsa -out "$CA_KEY_DIR/ca.key" 4096
  openssl req -x509 -new -nodes -key "$CA_KEY_DIR/ca.key" -sha256 -days 3650 \
    -subj "/CN=Orbit Local Dev CA" -out "$OUT_DIR/ca.crt"
fi

issue() { # issue <name> <subjectAltName> [extendedKeyUsage]
  local name="$1" san="$2" eku="${3:-serverAuth}" ext
  ext="$(mktemp)"
  printf 'subjectAltName = %s\nbasicConstraints = CA:FALSE\nkeyUsage = digitalSignature, keyEncipherment\nextendedKeyUsage = %s\n' "$san" "$eku" > "$ext"
  openssl genrsa -out "$OUT_DIR/$name.key" 2048
  openssl req -new -key "$OUT_DIR/$name.key" -subj "/CN=$name" -out "$OUT_DIR/$name.csr"
  openssl x509 -req -in "$OUT_DIR/$name.csr" -CA "$OUT_DIR/ca.crt" -CAkey "$CA_KEY_DIR/ca.key" \
    -CAcreateserial -CAserial "$CA_KEY_DIR/ca.srl" -out "$OUT_DIR/$name.crt" -days 825 -sha256 -extfile "$ext"
  rm -f "$OUT_DIR/$name.csr" "$ext"
}

issue redis "DNS:redis, DNS:localhost, IP:127.0.0.1"
issue api   "DNS:localhost, DNS:backend, IP:127.0.0.1"
issue client "DNS:orbit-api" clientAuth

# Readable by the non-root container users. Acceptable for throw-away local keys only.
chmod 644 "$OUT_DIR"/*.crt "$OUT_DIR"/*.key
echo "Certificates written to $OUT_DIR (CA key kept in $CA_KEY_DIR). Add both folders to .gitignore."
