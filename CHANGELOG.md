# Changelog

All notable changes to the mobile app are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/) and the
project uses [Semantic Versioning](https://semver.org/) for app versions
(`MAJOR.MINOR.PATCH`).

When bumping, edit BOTH `package.json` and `app.json` so they stay in
sync. Also bump `app.json -> expo.ios.buildNumber` (string) and
`app.json -> expo.android.versionCode` (integer) for every store-bound
build.

## [Unreleased]

## [1.2.0] - 2026-05-13

### Added
- POS order GPS capture on Validate Payment, with a Location chip on
  the post-payment receipt and the past-order detail screen. New Odoo
  module: `pos_order_location` (19.0.1.0.1).
- App Banners admin (in-app screens + new `app_banner` Odoo module
  19.0.2.0.0). 3:1 crop on upload via `expo-image-picker`, kanban
  view in the Odoo backend with 3:1 cards, header Archive / Delete
  buttons, chatter audit trail.
- Invoice paper-size picker (2" / 3" / 3.5" / 4") that fires before
  Preview / Download / Print on both the post-payment receipt and the
  past-order detail.
- Apps Privileges admin overhaul (rename, Hide All / Reset All bulk
  actions, ConfirmModal popups).
- Login-time location-permission prompt (asks once per install via
  `AsyncStorage` flag).
- `ConfirmModal` component — centered LogoutModal-style popup that
  replaces the system `Alert.alert` for destructive flows like banner
  delete.

### Changed
- Home tiles redesigned to a 2-column horizontal-row layout. Each tile
  carries the parent section's accent as a left stripe; titles fit on
  one line; tap target is wider.
- `OrderDetailScreen` items now render product images (fetched via a
  follow-up `product.product` read) and use a bidi-safe qty x price
  meta line that no longer reorders around the Arabic currency symbol.
- `Home` carousel banner card locked to 3:1 aspect on every device, so
  what the admin uploads at 3:1 displays without `cover`-cropping.

### Removed
- Local `assets/images/Home/Banner` fallback. The Home carousel only
  ever shows banners served by the `app.banner` Odoo module now.
- Sequence field UI on the banner admin (the column stays in the
  schema for backward compatibility; the app sends a constant `10`).
- Re-crop entry points on the Banners admin (the in-app crop screen
  and the navigator route). The first-time gallery picker's 3:1 crop
  is enough.

## [1.1.0] - prior release
- First publicly distributed version of the app. No detailed changelog
  was kept before this entry.
