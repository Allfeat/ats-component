# Changelog

## [2.0.1](https://github.com/Allfeat/ats-component/compare/v2.0.0...v2.0.1) (2026-04-28)

### Bug Fixes

* bold original filename on review step when skipping file update ([07eafb3](https://github.com/Allfeat/ats-component/commit/07eafb3d422722e4ac2a06d645247b8af3deecd2)), closes [Allfeat/ATS#109](https://github.com/Allfeat/ATS/issues/109)
* **ci:** upload CDN bundles under widgets/ats/ prefix ([97b6885](https://github.com/Allfeat/ats-component/commit/97b6885832a3e4d3f5a33e48ecc5c68b86afee86))
* **docs:** escape MDX expression placeholders in error-codes table ([90d80fc](https://github.com/Allfeat/ats-component/commit/90d80fc628f0a1397c44471147f825c5b25748dc))
* **styles:** make Add Creator button visible in dark themes ([10a677f](https://github.com/Allfeat/ats-component/commit/10a677f133bcd1247b17c2e2a7d37a0908925201))

## [2.0.0](https://github.com/Allfeat/ats-component/compare/v1.2.0...v2.0.0) (2026-04-12)

### ⚠ BREAKING CHANGES

* Token refresh no longer uses per-call onTokenExpired callbacks.
The component now uses a centralized handleError() method that routes errors
by code to the appropriate screen (DISABLED, FAILED, or token refresh).
* allfeat:failed and allfeat:error event payloads now use
{code, message, requestId, details} instead of {error, code, stage}.

### Features

* add DISABLED screen, structured error state, requestId in FAILED screen ([01f4092](https://github.com/Allfeat/ats-component/commit/01f4092ea0e527846ae053904b0715d82143f43b))
* add error message catalog with getErrorMessage() ([c5d77b1](https://github.com/Allfeat/ats-component/commit/c5d77b1ca4827373055f8bf890293456756bf89d))
* add global error interceptor, DISABLED screen, unified error handling ([32736f4](https://github.com/Allfeat/ats-component/commit/32736f47b0cc864f343ef4a8a89acd16e7176a80))
* update FailedDetail and ErrorDetail to structured error payloads ([6cd3605](https://github.com/Allfeat/ats-component/commit/6cd360522b64624506d460f5a1a7df752af9ebc7))

## [1.2.0](https://github.com/Allfeat/ats-component/compare/v1.1.2...v1.2.0) (2026-04-06)

### Features

* display existing filename in update file selection skip label ([7baee9d](https://github.com/Allfeat/ats-component/commit/7baee9d32daadfec1d4d0fb864755157e016f2ba))

### Bug Fixes

* rename "Asset File" label to "File" in review step ([eda1748](https://github.com/Allfeat/ats-component/commit/eda17484d9f48d416d6cac3e9962dd210d6e4ebe))

## [1.1.2](https://github.com/Allfeat/ats-component/compare/v1.1.1...v1.1.2) (2026-04-02)

### Bug Fixes

* bump package.json version via node hook instead of npm ([0d8c4f6](https://github.com/Allfeat/ats-component/commit/0d8c4f6817c51cf37032723b700d4da256713e30))
* re-enable npm plugin for package.json version bumping ([9e581c6](https://github.com/Allfeat/ats-component/commit/9e581c6cc3059f49e3210ffed37f790b0f86921d))

## [1.1.1](https://github.com/Allfeat/ats-component/compare/v1.1.0...v1.1.1) (2026-04-02)

### Bug Fixes

* switch CI workflows from npm/node to bun ([787e253](https://github.com/Allfeat/ats-component/commit/787e25354cace20a5db9b3775cb2f03a9d305dff))

## [1.1.0](https://github.com/Allfeat/ats-component/compare/v1.0.0...v1.1.0) (2026-04-02)

### Features

* add automated versioning and changelog with release-it ([c269a39](https://github.com/Allfeat/ats-component/commit/c269a396688bf0f745bd4d0cd705506999d59ece))
* display existing asset filename in review step during update ([8bc0fcb](https://github.com/Allfeat/ats-component/commit/8bc0fcbdc093c19a37af0c35a3eb370828f49839))

### Bug Fixes

* disable npm plugin in release-it to support bun-only environments ([b829f3e](https://github.com/Allfeat/ats-component/commit/b829f3ed37a6462e5fe2a1dbedcde1e9a65f44cf))
