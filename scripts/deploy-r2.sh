#!/bin/bash
set -e

# ============================================================================
# Allfeat ATS Component - CloudFlare R2 Deployment Script
# ============================================================================
# Manual deployment to CloudFlare R2 (for local use).
# For production releases, use: bun run release <major|minor|patch>
#
# Prerequisites:
#   - AWS CLI installed
#   - Environment variables set:
#     - CLOUDFLARE_ACCOUNT_ID
#     - CLOUDFLARE_R2_ACCESS_KEY_ID
#     - CLOUDFLARE_R2_SECRET_ACCESS_KEY
#     - R2_BUCKET_NAME (default: ats-component)
# ============================================================================

# Configuration
BUCKET="${R2_BUCKET_NAME:-ats-component}"
ENDPOINT="https://${CLOUDFLARE_ACCOUNT_ID}.eu.r2.cloudflarestorage.com"
DIST_DIR="dist"
VERSION=$(node -p "require('./package.json').version")
MAJOR=$(echo "$VERSION" | cut -d. -f1)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# S3 command helper
s3cmd() {
    AWS_ACCESS_KEY_ID="$CLOUDFLARE_R2_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$CLOUDFLARE_R2_SECRET_ACCESS_KEY" \
    AWS_REQUEST_CHECKSUM_CALCULATION=WHEN_REQUIRED \
    AWS_RESPONSE_CHECKSUM_VALIDATION=WHEN_REQUIRED \
    aws s3 "$@" --endpoint-url "$ENDPOINT" --region auto
}

check_prerequisites() {
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed."
        log_info "Install with: brew install awscli (macOS) or apt install awscli (Ubuntu)"
        exit 1
    fi

    if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
        log_error "CLOUDFLARE_ACCOUNT_ID is not set."
        exit 1
    fi

    if [ -z "$CLOUDFLARE_R2_ACCESS_KEY_ID" ] || [ -z "$CLOUDFLARE_R2_SECRET_ACCESS_KEY" ]; then
        log_error "R2 credentials are not set (CLOUDFLARE_R2_ACCESS_KEY_ID / CLOUDFLARE_R2_SECRET_ACCESS_KEY)."
        exit 1
    fi

    if [ ! -d "$DIST_DIR" ]; then
        log_error "Distribution directory '$DIST_DIR' not found. Run 'bun run build' first."
        exit 1
    fi

    if [ ! -f "$DIST_DIR/ats-widget.iife.js" ]; then
        log_error "IIFE bundle not found in $DIST_DIR. Run 'bun run build' first."
        exit 1
    fi
}

upload_files() {
    local files=("ats-widget.iife.js" "ats-widget.esm.js")

    # Upload versioned files (immutable cache)
    log_info "Uploading versioned files to /$VERSION/ ..."
    for file in "${files[@]}"; do
        if [ -f "$DIST_DIR/$file" ]; then
            s3cmd cp "$DIST_DIR/$file" "s3://$BUCKET/$VERSION/$file" \
                --content-type "application/javascript" \
                --cache-control "public, max-age=31536000, immutable"
            log_info "  $VERSION/$file"
        fi
    done

    # Upload major version alias (1h cache)
    log_info "Uploading major version alias to /v$MAJOR/ ..."
    for file in "${files[@]}"; do
        if [ -f "$DIST_DIR/$file" ]; then
            s3cmd cp "$DIST_DIR/$file" "s3://$BUCKET/v$MAJOR/$file" \
                --content-type "application/javascript" \
                --cache-control "public, max-age=3600"
            log_info "  v$MAJOR/$file"
        fi
    done

    # Upload latest alias (short cache)
    log_info "Uploading latest files to /latest/ ..."
    for file in "${files[@]}"; do
        if [ -f "$DIST_DIR/$file" ]; then
            s3cmd cp "$DIST_DIR/$file" "s3://$BUCKET/latest/$file" \
                --content-type "application/javascript" \
                --cache-control "public, max-age=300"
            log_info "  latest/$file"
        fi
    done
}

main() {
    echo ""
    echo "============================================"
    echo " Allfeat ATS Component - R2 Deployment"
    echo "============================================"
    echo ""
    log_info "Version: $VERSION"
    log_info "Bucket:  $BUCKET"
    echo ""

    check_prerequisites
    upload_files

    echo ""
    log_info "Deployment complete!"
    log_info "Files available at:"
    log_info "  https://cdn.allfeat.org/widgets/ats/$VERSION/ats-widget.iife.js  (pinned, immutable)"
    log_info "  https://cdn.allfeat.org/widgets/ats/v$MAJOR/ats-widget.iife.js   (major alias, 1h cache)"
    log_info "  https://cdn.allfeat.org/widgets/ats/latest/ats-widget.iife.js    (latest, 5min cache)"
    echo ""
}

main "$@"
