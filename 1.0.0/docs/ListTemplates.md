::wavedoc
---
title: List templates
description: |
  The List templates node lists the templates stored in a folder of the Vulcano template tree, including its subfolders. Leave Template folder id at the template root to list every template, or point it at one folder to narrow the list down. It is the usual first step of a graphics stream: wire Template ids into a following Create graphic node. Total count reports how many templates the folder holds altogether, which is how you tell whether Max results cut the list short.
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
  - name: Template folder id
    description: |
      Enter the folder to list, including its subfolders. Leave it empty for the template root. A folder Vulcano does not know returns nothing rather than failing
    type: STRING
    mandatory: false
    example:
      - name: Template folder id
        value: "root/Templates"
  - name: Search query
    description: |
      Enter a search query to keep only templates matching it. Vulcano does the matching, the same way the search field in its user interface does
    type: STRING
    mandatory: false
    example:
      - name: Search query
        value: "lower third"
  - name: Max results
    description: |
      Enter the maximum number of templates to return
    type: INT
    mandatory: false
    advanced: true
    example:
      - name: Max results
        value: 35
  - name: Sort by
    description: |
      Choose the field to sort the templates by
    type: STRING_SELECT
    mandatory: false
    advanced: true
    options:
      - name: Created
        description: |
          Sort by the date the template was added
        default: true
      - name: Name
        description: |
          Sort by the template name
      - name: Last modified
        description: |
          Sort by the date the template last changed
    example:
      - name: Sort by
        value: created
  - name: Sort direction
    description: |
      Choose whether to sort the templates ascending or descending
    type: STRING_SELECT
    mandatory: false
    advanced: true
    options:
      - name: Descending
        description: |
          Newest or last entry first
        default: true
      - name: Ascending
        description: |
          Oldest or first entry first
    example:
      - name: Sort direction
        value: desc
outputs:
  - name: Total count
    description: |
      Returns how many templates the folder holds in total, so a later node can branch on an empty result or notice that Max results cut the list short
    type: INT
    example:
      - name: Total count
        value: 2
  - name: Template ids
    description: |
      Returns the id of every template returned, ready to wire into a Create graphic node
    type: STRING_LIST
    example:
      - name: Template ids
        value: '["/News/Lower third.mogrt"]'
  - name: Template names
    description: |
      Returns the name of every template returned
    type: STRING_LIST
    example:
      - name: Template names
        value: '["Lower third"]'
  - name: Templates
    description: |
      Returns the full array of templates from Vulcano (raw response — escape hatch for fields not surfaced by curated outputs)
    type: OBJECT
    example:
      - name: Templates
        value: |
          [
            {
              "id": "/News/Lower third.mogrt",
              "name": "Lower third",
              "assetType": "mogrt"
            }
          ]
  - name: Curl
    description: |
      Returns the curl command equivalent of the request, with a placeholder in place of the api token
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X GET \
          -H "Authorization: Bearer <your-token>" \
          "https://vulcano.example.com/assets?id=root%2FTemplates&limit=35"
connectors:
  - name: Success
    description: |
      Triggered when the templates are listed successfully, including when the folder holds none
  - name: Fail
    description: |
      Triggered when the templates cannot be listed
    causes:
      - name: Response Parsing Error
        description: |
          If the answer is not a list of templates, which usually means something other than Vulcano replied
      - name: Permission Denied
        description: |
          If the provided Api token is invalid, expired, or lacks read access
      - name: API Error
        description: |
          If Vulcano returned an unexpected error response, or could not be reached
---
::
