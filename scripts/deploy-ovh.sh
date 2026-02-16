#!/bin/bash
set -e

# ============================================================================
# Allfeat ATS Component - OVH Object Storage Deployment Script
# ============================================================================
# This script uploads the built distribution files to OVH Object Storage.
# Prerequisites:
#   - AWS CLI installed and configured with OVH credentials
#   - Run: aws configure --profile ovh
#   - Enter your OVH Object Storage Access Key and Secret Key
# ============================================================================

# Configuration
BUCKET="allfeat-ats-component"
ENDPOINT="https://s3.gra.cloud.ovh.net"
PROFILE="ovh"
DIST_DIR="dist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Please install it first."
        log_info "Install with: brew install awscli (macOS) or apt install awscli (Ubuntu)"
        exit 1
    fi

    if ! aws configure get aws_access_key_id --profile "$PROFILE" &> /dev/null; then
        log_error "AWS profile '$PROFILE' is not configured."
        log_info "Run: aws configure --profile ovh"
        log_info "Enter your OVH Object Storage credentials when prompted."
        exit 1
    fi

    if [ ! -d "$DIST_DIR" ]; then
        log_error "Distribution directory '$DIST_DIR' not found."
        log_info "Run 'npm run build' first to generate the distribution files."
        exit 1
    fi

    if [ ! -f "$DIST_DIR/allfeat-ats-register.iife.js" ]; then
        log_error "IIFE bundle not found in $DIST_DIR"
        log_info "Run 'npm run build' to generate the bundle."
        exit 1
    fi
}

# Upload files to OVH Object Storage
upload_files() {
    log_info "Uploading distribution files to OVH Object Storage..."
    log_info "Bucket: $BUCKET"
    log_info "Endpoint: $ENDPOINT"
    echo ""

    # Upload main JS bundles
    log_info "Uploading JavaScript bundles..."
    aws s3 cp "$DIST_DIR/allfeat-ats-register.iife.js" "s3://$BUCKET/" \
        --profile "$PROFILE" \
        --endpoint-url "$ENDPOINT" \
        --content-type "application/javascript"

    # Upload ESM bundle if exists (for module-aware consumers)
    if [ -f "$DIST_DIR/allfeat-ats-register.esm.js" ]; then
        aws s3 cp "$DIST_DIR/allfeat-ats-register.esm.js" "s3://$BUCKET/" \
            --profile "$PROFILE" \
            --endpoint-url "$ENDPOINT" \
            --content-type "application/javascript"
    fi

    # Upload WASM files if the directory exists
    if [ -d "$DIST_DIR/wasm" ]; then
        log_info "Uploading WASM files..."
        aws s3 cp "$DIST_DIR/wasm/" "s3://$BUCKET/wasm/" \
            --recursive \
            --profile "$PROFILE" \
            --endpoint-url "$ENDPOINT" \
            --content-type "application/wasm"
    else
        log_warn "No WASM directory found in $DIST_DIR - skipping WASM upload"
    fi

    # Upload CSS if exists
    if [ -f "$DIST_DIR/component.css" ]; then
        log_info "Uploading CSS..."
        aws s3 cp "$DIST_DIR/component.css" "s3://$BUCKET/" \
            --profile "$PROFILE" \
            --endpoint-url "$ENDPOINT" \
            --content-type "text/css"
    fi
}

# List uploaded files
list_uploaded() {
    echo ""
    log_info "Uploaded files in bucket:"
    aws s3 ls "s3://$BUCKET/" \
        --profile "$PROFILE" \
        --endpoint-url "$ENDPOINT" \
        --recursive
}

# Main execution
main() {
    echo ""
    echo "========================================"
    echo " Allfeat ATS Component - OVH Deployment"
    echo "========================================"
    echo ""

    check_prerequisites
    upload_files
    list_uploaded

    echo ""
    log_info "Deployment complete!"
    log_info "Files are available via your Nginx proxy at:"
    log_info "  https://ats-component.allfeat.com/allfeat-ats-register.iife.js"
    echo ""
}

main "$@"
