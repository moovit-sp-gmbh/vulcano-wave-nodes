::wavedoc
---
title: Add assets to project
description: |
  The Add assets to project node adds assets that already exist in Vulcano to one of its projects. Wire Asset ids from an upstream Create graphic node to collect a freshly rendered graphic into the project it belongs to, and use Target location to hand the assets to the connected archive as well. Vulcano answers with success whatever happened on its side — an asset id it does not know is skipped, and even a failure part way through is reported as success — so check its log if a project ends up short.
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
  - name: Project id
    description: |
      Enter the id of the project the assets are added to. Vulcano creates the project when the id is unknown, so a typo makes a new project rather than failing
    type: STRING
    mandatory: true
    example:
      - name: Project id
        value: "7c9a1f02-5e33-42d1-9f88-1b2c3d4e5f60"
  - name: Asset ids
    description: |
      Enter the id of every asset to add to the project. Blank entries are dropped, and the node fails before sending anything if nothing is left
    type: STRING_LIST
    mandatory: true
    example:
      - name: Asset ids
        value: '["b3f0a1c2-9d44-4e18-8a77-2c1b5e6f0a91"]'
  - name: Target location
    description: |
      Enter the archive location to transfer the assets to. Leave it empty to only add them to the project. Vulcano starts the transfer but does not store the location on the asset, so it is not visible afterwards
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Target location
        value: "/Sendung/Grafiken"
outputs:
  - name: Project id
    description: |
      Returns the id of the project the assets were added to, so it can be chained into a following node
    type: STRING
    example:
      - name: Project id
        value: "7c9a1f02-5e33-42d1-9f88-1b2c3d4e5f60"
  - name: Sent asset count
    description: |
      Returns how many asset ids were sent. Vulcano skips ids it does not know and still reports success, so this is what was requested, not proof of what landed
    type: INT
    example:
      - name: Sent asset count
        value: 2
  - name: Curl
    description: |
      Returns the curl command equivalent of the request, with a placeholder in place of the api token
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X POST \
          -H "Authorization: Bearer <your-token>" \
          "https://vulcano.example.com/projects?projectID=7c9a1f02"
connectors:
  - name: Success
    description: |
      Triggered when the assets are added successfully
  - name: Fail
    description: |
      Triggered when the assets cannot be added
    causes:
      - name: Invalid Input
        description: |
          If Asset ids holds no usable id once blank entries are dropped
      - name: API Error
        description: |
          If Vulcano returned an unexpected error response
      - name: Permission Denied
        description: |
          If the provided Api token is invalid, expired, or lacks write access
      - name: Network Issue
        description: |
          If Vulcano could not be reached
---
::
