## Purpose

Preserve a user's existing directory model choice when upgrading Windows installations from locale-dependent directory keys to canonical UTF-8 keys.

## ADDED Requirements

### Requirement: Preserve existing directory model choices

On Windows, the system SHALL read an existing legacy directory model setting when the canonical UTF-8 setting is absent. Both native and forward-slash representations of the same directory SHALL support this compatibility behavior. Invalid legacy encodings or malformed files MUST NOT prevent session startup.

#### Scenario: Upgrade an existing Chinese directory
- **WHEN** a directory has a model setting saved by the previous Windows version and no canonical setting
- **THEN** the saved model is returned after upgrading, including when the directory is presented with forward slashes

#### Scenario: Canonical settings take priority
- **WHEN** the canonical setting exists alongside a legacy setting
- **THEN** only the canonical setting is used, including treating an invalid canonical file as unset

#### Scenario: A legacy conversion cannot be decoded
- **WHEN** the current directory cannot be represented by a legacy conversion or its legacy file is malformed
- **THEN** the lookup remains non-fatal and returns no legacy model for that candidate

### Requirement: Removed settings remain removed

Explicit directory model removal SHALL remove canonical and applicable legacy settings so compatibility lookup cannot reactivate an old choice. New settings SHALL be written to the canonical location.

#### Scenario: Remove a previously upgraded setting
- **WHEN** a user removes a directory model choice with both canonical and legacy copies
- **THEN** subsequent lookup returns no directory override
