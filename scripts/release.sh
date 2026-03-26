#!/bin/bash
set -e

# ============================================================================
# Allfeat ATS Component - Release Helper
# ============================================================================
# Usage: ./scripts/release.sh <major|minor|patch> [--dry-run]
#
# This script:
#   1. Validates you're on master with a clean working tree
#   2. Runs typecheck + build
#   3. Bumps version in package.json (no git tag from npm)
#   4. Commits the version bump
#   5. Creates a git tag vX.Y.Z
#   6. Pushes commit + tag to origin (triggers release workflow)
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

BUMP_TYPE="${1:-}"
DRY_RUN=false

if [ "$2" = "--dry-run" ]; then
    DRY_RUN=true
fi

if [[ ! "$BUMP_TYPE" =~ ^(major|minor|patch)$ ]]; then
    echo "Usage: $0 <major|minor|patch> [--dry-run]"
    echo ""
    echo "Examples:"
    echo "  $0 patch      # 1.0.0 -> 1.0.1"
    echo "  $0 minor      # 1.0.0 -> 1.1.0"
    echo "  $0 major      # 1.0.0 -> 2.0.0"
    exit 1
fi

# Check we're on master
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "master" ]; then
    log_error "Must be on 'master' branch to release (currently on '$BRANCH')"
    log_info "Run: git checkout master && git pull origin master"
    exit 1
fi

# Check clean working tree
if [ -n "$(git status --porcelain)" ]; then
    log_error "Working tree is not clean. Commit or stash changes first."
    git status --short
    exit 1
fi

# Pull latest
log_step "Pulling latest from origin/master..."
git pull origin master

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
log_info "Current version: $CURRENT_VERSION"

# Calculate new version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
case "$BUMP_TYPE" in
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    patch) PATCH=$((PATCH + 1)) ;;
esac
NEW_VERSION="$MAJOR.$MINOR.$PATCH"
log_info "New version: $NEW_VERSION ($BUMP_TYPE bump)"

if $DRY_RUN; then
    log_warn "Dry run - would release v$NEW_VERSION"
    exit 0
fi

# Confirm
echo ""
echo -e "Release ${CYAN}v$NEW_VERSION${NC} ? (y/N)"
read -r CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    log_info "Aborted."
    exit 0
fi

# Typecheck
log_step "Running typecheck..."
npx tsc --noEmit

# Build
log_step "Building..."
npm run build

# Bump version in package.json (--no-git-tag-version so we control the tag)
log_step "Bumping version in package.json..."
npm version "$BUMP_TYPE" --no-git-tag-version

# Commit + tag
log_step "Creating commit and tag..."
git add package.json
git commit -m "release: v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "v$NEW_VERSION"

# Push
log_step "Pushing to origin..."
git push origin master
git push origin "v$NEW_VERSION"

echo ""
log_info "Released v$NEW_VERSION!"
log_info "The release workflow will now:"
log_info "  - Build and upload to R2 CDN"
log_info "  - Create a GitHub Release with assets"
log_info ""
log_info "Track progress: https://github.com/Allfeat/ats-component/actions"
