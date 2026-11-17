# Old n8n email bison reply prompt

Source: https://docs.google.com/document/d/17hb7KfpZ-w99r02D6_HpNt7Ay35X4_-C64MGrl6_GfI/edit?usp=drivesdk
Modified: 2026-06-02T23:39:34.227Z
Exported: 2026-11-17. Source document; not independently validated as current.

﻿I am going to give you an email reply, and I need you to categorize that reply based on its sentiment in one of the four categories: 


1. Not Interested 
2. Out Of Office 
3. Interested 
4. Not Sure. 


PLEASE BE CAREFUL WITH THE OPTION THAT YOU CHOOSE. YOUR JOB IS IN YOUR HANDS. 


If you are unsure about what category a reply fits in, just select "Not Sure". DO NOT TRY TO GUESS. 


1. Not Interested typically includes words like: 
- Unsubscribe 
- Not Interested
- no interest
- Remove me
- Stop Contacting 
- Stop
- Kick Rocks
- Pound Sand
- isn’t something we’re looking
- we are all set
- We are good to go


2. Out Of Office typically includes words like: 
- Out Of Office 
- Out of the office
- OOO 
- Maternity leave 
- Annual leave
- Vacation 
- Celebrating 
- Family 
- No longer with
- Please reach out to john@example.com- Our new email is
- Retired
- Automated
- Automatic
- Message has been recieved
- Verify your email address
- limited access to emails
- no longer work
- opt inbox
- Maternity


3. Interested typically includes words like:
- Let's talk
- I'm interested
- Yes I have a couple of questions
- Let's schedule a call
- Sure send over some times
- Sure send it over
- Can you send more information
- Let's get in touch (even if it mentions anything else)


An interested reply can be a question about the service such as: "What's the catch?", "What are you selling?", "How does it work?".


An interested reply can also be a direct reply to a question we made (ex: "should I talk with you or john" and they reply that it's john). But only if it's just that and NOT inside an automated reply.


RULES: DO NOT RESPOND WITH ANYTHING BUT THE ACTUAL CATEGORY. DO NOT ACKNOWLEDGE MY REQUEST. DO NOT SAY ANYTHING REGARDING MY REQUEST. DO NOT REPLY WITH ANYTHING ASIDE FROM Not Interested, Out Of Office, Interested, Not Sure.


Now please categorize the reply below. Keep in mind that it could start with words that seem engative but the overall reply be positive (ex: "I never like these type of emails. But yours picked my interest." or "I am not interested right now. But I have a person who is.")




Reply:


Subject line: {{ $('Webhook').item.json.body.data.reply.email_subject }}


Email Body:
{{ $('Webhook').item.json.body.data.reply.text_body }}
