::wavedoc
---
title: Create ograf link
description: |
  The Create ograf link node creates a shareable link that plays an asset's OGraf graphic in a browser, without the viewer needing a Vulcano account. The asset has to have been converted to OGraf already. The link expires on its own after the number of days you set, and Link control values lets you preset the texts and colours the graphic starts with. Player url is the address to hand out.
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
  - name: Asset id
    description: |
      Enter the id of the asset to share. It must have an OGraf bundle, otherwise Vulcano has nothing to play
    type: STRING
    mandatory: true
    example:
      - name: Asset id
        value: "b3f0a1c2-9d44-4e18-8a77-2c1b5e6f0a91"
  - name: Link expiry days
    description: |
      Enter the number of days the link stays valid, between 1 and 365. Leaving it empty uses 30 days, since Vulcano needs a whole number here
    type: INT
    mandatory: false
    advanced: true
    example:
      - name: Link expiry days
        value: 30
  - name: Link label
    description: |
      Enter a label to recognise the link by in the Vulcano user interface
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Link label
        value: "Newsroom preview"
  - name: Link control values
    description: |
      Enter the control values the player starts with, as a JSON object. Invalid JSON, or a JSON value that is not an object, fails the node before any request is sent
    type: STRING_LONG
    mandatory: false
    advanced: true
    example:
      - name: Link control values
        value: '{"headline":"Breaking news"}'
outputs:
  - name: Link id
    description: |
      Returns the id of the new link, which is what a later node needs to revoke it
    type: STRING
    example:
      - name: Link id
        value: "0d5c1a7e-88b3-4f2a-91cc-5e7d3b2a1f04"
  - name: Link token
    description: |
      Returns the token that grants access to the shared graphic. Treat it like a password — anyone holding it can open the player
    type: STRING
    example:
      - name: Link token
        value: "Zm9vYmFyLXRva2VuLTEyMw"
  - name: Player url
    description: |
      Returns the ready to share OGraf player url for the asset
    type: STRING
    example:
      - name: Player url
        value: "https://vulcano.example.com/ograf-player.html?link=Zm9vYmFyLXRva2VuLTEyMw"
  - name: Ograf link
    description: |
      Returns the full link object from Vulcano (raw response — escape hatch for fields not surfaced by curated outputs)
    type: OBJECT
    example:
      - name: Ograf link
        value: |
          {
            "id": "0d5c1a7e-88b3-4f2a-91cc-5e7d3b2a1f04",
            "token": "Zm9vYmFyLXRva2VuLTEyMw",
            "status": "ACTIVE"
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
          "https://vulcano.example.com/assets/ograf/links?assetId=b3f0a1c2"
connectors:
  - name: Success
    description: |
      Triggered when the link is created successfully
  - name: Fail
    description: |
      Triggered when the link cannot be created
    causes:
      - name: Invalid Input
        description: |
          If Link control values is not valid JSON, or is valid JSON that is not an object
      - name: Invalid Configuration
        description: |
          If Vulcano rejects the request (400) because Link expiry days is not a whole number between 1 and 365
      - name: Asset Not Found
        description: |
          If Vulcano has no asset with the given Asset id, or that asset has no OGraf bundle (404)
      - name: Permission Denied
        description: |
          If the provided Api token is invalid, expired, or lacks write access
      - name: Response Parsing Error
        description: |
          If Vulcano answers with a link that carries no token, which leaves no address to hand out
      - name: API Error
        description: |
          If Vulcano returned an unexpected error response, or could not be reached
---
::
