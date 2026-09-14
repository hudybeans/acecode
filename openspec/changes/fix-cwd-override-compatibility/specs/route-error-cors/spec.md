## Purpose

Allow supported clients on another loopback port to receive structured daemon errors while preserving the existing authentication and origin restrictions.

## ADDED Requirements

### Requirement: Error responses follow the existing CORS policy

HTTP responses, including uncaught route errors, SHALL carry the existing loopback CORS headers for supported loopback origins. CORS headers MUST NOT be duplicated on responses already decorated by a route. Authentication requirements and rejection of unsupported origins SHALL remain unchanged.

#### Scenario: An authenticated cross-port request fails in a route
- **WHEN** a request carries a supported loopback Origin and valid daemon token and its handler throws
- **THEN** the client receives the JSON 500 error with a matching Access-Control-Allow-Origin header

#### Scenario: Normal responses already have CORS headers
- **WHEN** a route has already applied the CORS policy
- **THEN** completion does not append duplicate Access-Control-Allow-Origin headers

#### Scenario: An unsupported origin sends a request
- **WHEN** a request has an unsupported non-loopback Origin
- **THEN** it receives no Access-Control-Allow-Origin permission and remains subject to the existing authentication rejection
