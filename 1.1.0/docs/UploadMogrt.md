::wavedoc
---
title: Upload mogrt
description: |
  The Upload mogrt node uploads a Motion Graphics template from the machine the agent runs on into a folder of the Vulcano template tree. Vulcano picks the file up from there and analyses it, which makes its properties available to the Create graphic node once the analysis has finished. Uploading a file that is already in the tree replaces it and keeps the configuration of the existing template.
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
  - name: Tree node id
    description: |
      Enter the id of the template tree node to upload the file into. That is the folder the template appears in inside Vulcano. Vulcano creates the folder when the id is unknown, so a typo plants a new folder rather than failing
    type: STRING
    mandatory: true
    example:
      - name: Tree node id
        value: "News"
  - name: Mogrt file path
    description: |
      Enter the absolute path of the mogrt file to upload. The file must be reachable from the machine the agent runs on
    type: STRING
    mandatory: true
    example:
      - name: Mogrt file path
        value: "/Users/helmut/templates/Lower third.mogrt"
outputs:
  - name: Uploaded file name
    description: |
      Returns the file name the mogrt was stored under in Vulcano
    type: STRING
    example:
      - name: Uploaded file name
        value: "Lower third.mogrt"
  - name: File size
    description: |
      Returns the size of the uploaded file in bytes
    type: INT
    example:
      - name: File size
        value: 1048576
connectors:
  - name: Success
    description: |
      Triggered when Vulcano has stored the file. It analyses the template afterwards, so success means the bytes arrived, not that the template is ready — its properties are not readable straight away
  - name: Fail
    description: |
      Triggered when the mogrt cannot be uploaded
    causes:
      - name: Invalid Input
        description: |
          If the Mogrt file path does not end in .mogrt
      - name: File Not Found
        description: |
          If there is no file at the Mogrt file path, or the agent cannot read it
      - name: Permission Denied
        description: |
          If the provided Api token is invalid or expired, or is not an admin token — uploading templates needs one (403)
      - name: Stream Canceled
        description: |
          If the stream is stopped while the upload is running
      - name: API Error
        description: |
          If Vulcano could not store the file (500), which usually means the Tree node id or its templates folder is wrong, or it returned another unexpected error response, or could not be reached
---
::
