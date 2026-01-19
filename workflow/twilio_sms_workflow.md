# Twilio SMS Workflow

## Description

This workflow enables sending SMS messages via Twilio. It can be triggered manually and requires a message and phone number as inputs.

## Configuration

```
name: send sms
enabled: true
triggers:
  - type: manual
inputs:
  - name: message
    type: string
    description: The message to send to the phone number.

  - name: phone_number
    type: string
    description: The phone number to send the message to.

consts:
  TWILIO_ACCOUNT: "****"
  BASIC_AUTH: "****"
  FROM_PHONE_NNUMBER: "****"
steps:
  - name: http_step
```
