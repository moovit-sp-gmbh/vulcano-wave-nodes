::wavedoc
---
title: Create vgg project
description: |
  The Create vgg project node starts a new Video Graphic Generator project in Vulcano from a video file on the machine the agent runs on. It does the two steps the Vulcano user interface does: it uploads the video, then saves a new project that has that video as its base video. Vulcano prepares the browser preview and the reframed renditions of the video in the background, so the project may take a moment to be playable. The project starts in draft with no graphics on it yet, ready for a person to open it in Vulcano and place them. Wire Project id into a following node to keep working with the same project.
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
  - name: Video file path
    description: |
      Enter the absolute path of the video file to use as the base video. The file must be reachable from the machine the agent runs on
    type: STRING
    mandatory: true
    example:
      - name: Video file path
        value: "/Users/helmut/media/interview.mp4"
  - name: Project name
    description: |
      Enter the name of the new project. Leave it empty to name the project after the video file
    type: STRING
    mandatory: false
    example:
      - name: Project name
        value: "Interview"
  - name: Project id
    description: |
      Enter the id of the new project. Leave it empty to generate a fresh draft id, in the same shape the Vulcano user interface uses
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Project id
        value: "draft_1757433600000_a1b2c3d4"
outputs:
  - name: Project id
    description: |
      Returns the id of the new project, ready to wire into later packaging steps
    type: STRING
    example:
      - name: Project id
        value: "draft_1757433600000_a1b2c3d4"
  - name: Project name
    description: |
      Returns the name of the new project
    type: STRING
    example:
      - name: Project name
        value: "Interview"
  - name: Base video path
    description: |
      Returns the path Vulcano stored the uploaded video at on the server
    type: STRING
    example:
      - name: Base video path
        value: "/vulcano/media/interview.mp4"
  - name: Project
    description: |
      Returns the full project object from Vulcano (raw response — escape hatch for fields not surfaced by curated outputs)
    type: OBJECT
    example:
      - name: Project
        value: |
          {
            "id": "draft_1757433600000_a1b2c3d4",
            "name": "Interview",
            "status": "DRAFT"
          }
  - name: Curl
    description: |
      Returns the curl command equivalent of the request that saved the project, with a placeholder in place of the api token. The video upload is a file transfer and has no curl equivalent here
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X PUT \
          -H "Authorization: Bearer <your-token>" \
          https://vulcano.example.com/graphicGenerator/jobs/draft_1757433600000_a1b2c3d4
connectors:
  - name: Success
    description: |
      Triggered when the video is uploaded and the project is saved
  - name: Fail
    description: |
      Triggered when the project cannot be created
    causes:
      - name: File Not Found
        description: |
          If there is no file at the Video file path, or the agent cannot read it
      - name: Invalid Input
        description: |
          If Vulcano does not accept the video format (415)
      - name: Duplicate
        description: |
          If a project with the given Project id is already being packaged (409) and must not be overwritten
      - name: Permission Denied
        description: |
          If the provided Api token is invalid, expired, or lacks write access
      - name: API Error
        description: |
          If Vulcano returned an unexpected error response, or could not be reached
---
::
