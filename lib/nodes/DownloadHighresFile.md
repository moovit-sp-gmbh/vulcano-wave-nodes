::wavedoc
---
title: Download highres file
description: |
  The Download highres file node saves the rendered high resolution file of a Vulcano asset onto the machine the agent runs on. It streams the file into a temporary file next to the target and moves it into place only once the transfer has finished, so a failed or canceled transfer never leaves a half written file behind and never touches a file that was already there. Progress is reported while it runs. Wire Asset id from an upstream Create graphic node once the graphic has finished rendering. An asset that is a template rather than a rendered graphic has no high resolution video, and Vulcano answers with its Motion Graphics template file instead — give File name a .mogrt ending in that case.
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
      Enter the id of the asset to download the high resolution file of
    type: STRING
    mandatory: true
    example:
      - name: Asset id
        value: "b3f0a1c2-9d44-4e18-8a77-2c1b5e6f0a91"
  - name: Target folder
    description: |
      Enter the absolute path of the folder to save the file in. The folder must be reachable from the machine the agent runs on
    type: STRING
    mandatory: true
    example:
      - name: Target folder
        value: "/Users/helmut/downloads"
  - name: File name
    description: |
      Enter the file name to save the download as. Only the name itself is used, so a path in front of it is ignored and the file always lands in Target folder
    type: STRING
    mandatory: true
    example:
      - name: File name
        value: "lower-third-01.mov"
  - name: Duplicate file option
    description: |
      Choose how to handle an existing file with the same name. Leaving it empty is the same as choosing Fail
    type: STRING_SELECT
    mandatory: false
    advanced: true
    options:
      - name: Fail
        description: |
          Stop the node when the file already exists
        default: true
      - name: Skip
        description: |
          Keep the existing file and report its path without downloading again
      - name: Overwrite
        description: |
          Replace the existing file with the download
      - name: Rename existing
        description: |
          Rename the existing file out of the way, then download
      - name: Increment name
        description: |
          Add a counter to the new file name so both files are kept
    example:
      - name: Duplicate file option
        value: Fail
outputs:
  - name: File path
    description: |
      Returns the final path of the downloaded file, which differs from the requested one when the duplicate file option renamed it
    type: STRING
    example:
      - name: File path
        value: "/Users/helmut/downloads/lower-third-01.mov"
  - name: File size
    description: |
      Returns the size of the downloaded file in bytes
    type: INT
    example:
      - name: File size
        value: 20480
connectors:
  - name: Success
    description: |
      Triggered when the file is downloaded successfully, or when an existing file was kept because the duplicate file option is Skip
  - name: Fail
    description: |
      Triggered when the file cannot be downloaded
    causes:
      - name: File Not Found
        description: |
          If Vulcano holds no high resolution file for the given Asset id (404), which also happens while the asset is still rendering
      - name: Permission Denied
        description: |
          If the provided Api token is invalid, expired, or lacks read access
      - name: Invalid Input
        description: |
          If File name is empty or is not a usable file name
      - name: Invalid Configuration
        description: |
          If the Target folder cannot be written to, or a file of that name already exists and the duplicate file option is Fail
      - name: API Error
        description: |
          If Vulcano returned an unexpected error response, or could not be reached
      - name: Timeout
        description: |
          If Vulcano does not start answering the request within a minute
      - name: Stream Canceled
        description: |
          If the stream is stopped while the download is running, in which case the partly downloaded file is removed
---
::
