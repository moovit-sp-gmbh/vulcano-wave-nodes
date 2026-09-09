::wavedoc
---
title: Create graphic
description: |
  The Create graphic node creates a new asset from an existing Vulcano template and hands it to the render queue. Point it at the template with Template asset id — typically taken from an upstream List templates node — and fill in the values the template exposes with Graphic property values, keyed by property id. Any property you leave out keeps the value stored on the template, and a property id the template does not have fails the node — Vulcano itself would drop it without a word. The node returns immediately with the queued asset, so wire Graphic id into a Download highres file node once rendering has finished.
inputs:
  - name: Vulcano url
    description: |
      Enter the base url of the Vulcano instance
    type: STRING
    mandatory: true
    example:
      - name: Vulcano url
        value: "https://vulcano.example.com"
  - name: Api token
    description: |
      Enter the service token generated in the Vulcano user interface. For production credentials, wire this input from an upstream Get space secret node; for testing, a literal value also works
    type: STRING_PASSWORD
    mandatory: true
    example:
      - name: Api token
        value: "vt_9f4Ac2Kd1QeR7tYu0pZxLm3Nb6Vs8Wq2"
  - name: Template asset id
    description: |
      Enter the id of the template asset the graphic is created from
    type: STRING
    mandatory: true
    example:
      - name: Template asset id
        value: "/News/Lower third.mogrt"
  - name: Vulcano user
    description: |
      Enter the Vulcano user the new graphic is created for. The graphic shows up in that user's assets
    type: STRING
    mandatory: true
    example:
      - name: Vulcano user
        value: "jdoe"
  - name: Graphic property values
    description: |
      Enter the property values to fill in, keyed by property id — not by property name. Leave the map empty to render the template exactly as it is stored
    type: STRING_MAP
    mandatory: false
    example:
      - name: Graphic property values
        value: '{"6f1c1d24-6a63-4d9b-9a0e-6f5a2a4d1c88": "Breaking news"}'
  - name: Output file name
    description: |
      Enter the file name for the rendered graphic. Leave it empty to let Vulcano apply the naming pattern configured on the template
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Output file name
        value: "lower-third-01"
  - name: Output duration seconds
    description: |
      Enter the render duration in seconds. Zero keeps the duration stored on the template
    type: INT
    mandatory: false
    advanced: true
    example:
      - name: Output duration seconds
        value: 10
outputs:
  - name: Graphic id
    description: |
      Returns the id of the newly created graphic
    type: STRING
    example:
      - name: Graphic id
        value: "b3f0a1c2-9d44-4e18-8a77-2c1b5e6f0a91"
  - name: Graphic status
    description: |
      Returns the render status of the new graphic, so a later node can branch on whether it is still queued
    type: STRING
    example:
      - name: Graphic status
        value: "QUEUED"
  - name: Graphic name
    description: |
      Returns the name of the newly created graphic
    type: STRING
    example:
      - name: Graphic name
        value: "lower-third-01"
  - name: Graphic
    description: |
      Returns the full asset object from Vulcano (raw response — escape hatch for fields not surfaced by curated outputs)
    type: OBJECT
    example:
      - name: Graphic
        value: |
          {
            "id": "b3f0a1c2-9d44-4e18-8a77-2c1b5e6f0a91",
            "name": "lower-third-01",
            "status": "QUEUED"
          }
  - name: Curl
    description: |
      Returns the curl command equivalent of the request, with a placeholder in place of the api token
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X POST \
          -H "Authorization: Bearer <your-token>" \
          "https://vulcano.example.com/assets?user=jdoe&reduced=true"
connectors:
  - name: Success
    description: |
      Triggered when the graphic is created successfully
  - name: Fail
    description: |
      Triggered when the graphic cannot be created
    causes:
      - name: Invalid Input
        description: |
          If Graphic property values names a property id the template does not have, so the value would have been silently ignored
      - name: Asset Not Found
        description: |
          If Vulcano has no asset with the given Template asset id (404)
      - name: Permission Denied
        description: |
          If the provided Api token is invalid, expired, or lacks write access
      - name: API Error
        description: |
          If Vulcano returned an unexpected error response, or could not be reached
---
::
