# Google Workspace Email Account Setup + Smartlead Connection SOP

Source: https://docs.google.com/document/d/1htCioIC9dzpzvQJsOuxwgpWwpL-EzP7zwvkkEcziOtc/edit?usp=drivesdk
Account: info@dulcymedia.com
Modified: 2024-07-13T17:18:11.506Z
Exported: 2026-11-17. Historical reference; not independently validated as current.

﻿Gsuite Account Setup + Smartlead Connection SOP


This SOP goes over:
1. Connecting domains bought on Porkbun.com to Gsuite
2. Creating email accounts in Gsuite
3. Connecting those accounts to Smartlead


________________




Prerequisites (done by cardholder):


Create Email Account Spreadsheet:


1. Make a copy of this spreadsheet. 
2. Input porkbun account info.
  

3. Input the domains that you bought and want to set up on Gsuite in the Domain Info section. 


Create Admin Account:


1. Go to this website and press Get started.


2. Fill out your personal information (or of the client your are setting it up for). 


  
  







3. Choose the option to continue with a your-company.com address. 
  







4. Select the button Yes, I have one I can use. 
  









5. Enter one of the domains you bought on Porkbun. 


NOTE: this will be the main admin account for all of your email accounts. 
  





6. Select Next
  











7. Type the username in the first field and create a password. 


NOTE: use Password Generator to create a password. 
  







8. Record the credentials in the clients email account spreadsheet that you made a copy of earlier. 
  





9. Next, you’ll be prompted to “verify your identity” with a phone number. 


Either use your personal phone number, or if that doesn’t work, use SMS Pool. 


If you don’t get this question, move to the next step. 
  

10. Click I understand. 
  

11. Select Try free for 14 days.
  





12. Enter Personal & Payment Details. Complete purchase. 


13. Go to https://admin.google.com/. 


14. In the search bar, search for Users. 
  





15. You should only have 1 user. Click on your name. 


  









16. You should see this page now. Scroll down until you see the Licences section. Expand the section by clicking on the downward award. 


  







17. Go to the Billing section. 


  







18. Select Add or upgrade subscription. 
  







19. Downgrade the to the Google Workspace Business Starter plan. 


  







20. Confirm downgrade. 


  





21. Select the flexible plan. Checkout. 


  



22. Place order. 




  





________________




Assistants: begin work here


1. Open a new chrome profile. 


  







2. Log in with the credentials of the admin in the spreadsheet given to you. 
NOTE: the admin account are the credentials that are in the first line of the spreadsheet. 


  





3. Next, you’ll be prompted to “verify your identity” with a phone number. 


Either use your personal phone number, or if that doesn’t work, use SMS Pool. 


If you don’t get this question, move to the next step. 
  







4. Once you are in the admin console, your screen should look like this. 
  









5. Click verify domain. Go to porkbun.com and go to the DNS records of the domain of the admin email account.


  







6. In the admin console, click Next: Go to step 2.
  







7. Add the MX records from the Google Admin Console in the DNS section under your domain in Porkbun. Once you click Add scroll down and check that the record was added under the “Current Records” section. 


  



8. Add the second MX record with the unique verification code you copied from the Admin Console.


NOTE:  make sure that you set the priority to 15. 


The record should look like this once you click Add. 


  





9. Go to the Google Admin Console and press Activate Gmail in the bottom right corner. 


NOTE: this takes a few minutes; leave the tab open. 


10. Once prompted, click Finish in the bottom right corner. 


11. After that, you should be on this screen. If not, go to the Manage users section of the Admin console. 
  



12. On this screen, click continue. 


  



13. Select add another user. 


  



14. Input the specific details for the client you are making the accounts for. Leave the section “email alias” blank. Once done, click Save User. 


NOTE: for the second account that you make for each domain, include the first letter of the last name. 


Example:  
1st account: alex@infinitebookings.biz
2nd account: alexm@infinitebookings.biz 


  







15. Once the user is added, press Continue. 


16. In the admin console, go to Users, and click on the account you just created. 


17. On the left hand side, click Reset Password. 


18. Use password generator to create a password. Deselect the option to “Ask user to change their password when they sign in.”


  




19. Once you reset the password, update the spreadsheet with the new information.  You should now have 2 accounts stored. 


20. Go back to the home page and search for Manage Domains. 


21. Click Add Domain. 


22. Enter the name of the next domain that you will add. YOU CAN ADD A MAXIMUM OF 25 DOMAINS TO EACH ADMIN ACCOUNT. 

Under the “Select a domain type” section select Secondary Domain. 


        Once selected click Add domain & start verification. 


  



   23. In Porkbun, go to the DNS section of the domain you just added. 




  





   24. Enter the verification code from the google admin console and create a TXT record with it. 


  


It should look like this while you are adding it. 


  



NOTE: once you click Add, scroll to the bottom of the DNS record section and confirm the record was added. 


  





   25. Once you add the TXT record in Porkbun, go back to the the admin console and click Protect Domain.


NOTE: this takes a few minutes. Do not close the tab. 


If the domain is NOT verifying, go back to porkbun and ensure that the TXT record you input was correct. 




   26. On the “manage domains” section select “activate gmail” for all accounts.


   27. Select Set up MX record. Press Next. 


  



   28. Add the MX record to to the DNS section of the domain in Porkbun. Then go back tot he google admin console and select verify domain. 


**REPEAT FOR THE REST OF THE DOMAINS BEFORE MOVING TO THE NEXT STEP. **




   29. Now you have all of your domains connected to the admin console and you should be on this screen. 


  





   30. Next to one of the domains that doesn’t have users set up, click Add Users. 


  



   31. Input the user information for the accounts your are making. 


        Do not include a secondary email or phone number. 


        Upload the profile picture provided to you and create a password using Password Generator. 


        Deselect “Ask user to change their password when they sign in.”


        Store the credentials in the spreadsheet provided to you. 


        Once complete, click Add New User. 


  





   32. Repeat for the second email account for that specific domain you are setting up. 


** REPEAT CREATING 2 ACCOUNTS FOR EACH DOMAIN UNTIL ALL ARE COMPLETED **


NOTE: to create the 11th account you will need to being the “paid service”


Once prompted, press “begin paid service” to continue making the rest of the email accounts. 






   33. Adding SPF Record. 


   1. Go to Porkbun DNS record section for the domain you are working on. 
   2. Scroll down to the “Quick DNS Config” section
   3. Select “Google Workspace.” 
   4. Add the records. 
   5. Confirm the record was successfully added. 


  





   34. Adding DMARC Record. 


   1. Go to the DNS section of the domain you are working on in Porkbun. 
   2. Create another TXT record with the following values:


Host Name: “_dmarc”
Answer: “v=DMARC1; p=quarantine; pct=90; sp=none”
TTL: leave the default


   3. Click Add. 
   4. Scroll down and make sure the record was successfully added. 








   35. Creating & Adding DKIM Record. 


   1. Go to Apps > Google Workspace > Gmail.
   2. Click on the section Authenticate email.
   3. Select the domain you are working on.


  



   4. Click on Generate New Record. 


  



   5. When you get the “Generate new record” popup, don’t change any settings - click generate. 




  



   6. Refresh the page. You should see the values in the gray box. 


  



   7. Go to Porkbun and create a TXT record with the values in the gray box for that domain. 




   8. Once complete, return to the “Authenticate email” page and click Start Authentication. 


NOTE: this usually takes a few minutes, up to a few hours, to authenticate fully. Leave the tab open until the authentication is complete. 




   36. Adding Email Accounts to Smartlead


   1. Go to Smartlead.ai. Log in. 
   2. Go to the Email Accounts section. 
   3. In the top right corner, press Add Account(s)
   4. Click on the Gmail Logo Option. 
   5. Copy the Client ID from the popup to your clipboard. 
   6. In another tab, go to this link. (make sure you are logged into the correct admin account)
   7. Click Add App. 
   8. Select OAuth App Name or Client ID. 


  



   9. Paste the Client ID you copied from Smartlead and press search. 


  



   10. Under “App Name” section, Smartlead.ai will appear - click select.
  
 




   11. Check the box. Click Select. 


  





   12. Make sure the proper organization is selected. Press Continue. 


  





   13. Select “Trusted.” Press Continue.  


  



   14. On the review page, click Finish. 
   15. Once you are done with adding the Client ID, go back to Smartlead.ai. 
   16. Press Connect Account. 


  



   17. You will be prompted to log into the google account. Click Use Another Account and enter the account credentials of the account you are adding. Log into the account. 


  



   18. Press Continue to confirm login. 
  



   19. Press Allow. 
  



   20. You should see this now. 


  



If you do not see this - the account did not successfully connect to Smartlead and you have to repeat this step. Make sure you added the Client ID to the Admin Console correctly. 




        37. Configure Email Settings Within Smartlead. 


   1. Under the “General” section change the settings to”
   1. Message Per Day (Warmups not included): 20
   2. Minimum time gap (min): 3
   3. Signature:
                “

                Thanks, 


                FULL NAME
                POSITION @ COMPANY NAME”


   2. Setting up custom tracking domain. 
   1. Select “Use a custom tracking domain.”
   2. Go to Porkbun DNS section for the domain you are on. 
   3. Add a CNAME record 
Host: “emailtracking”
Value: “open.sleadtrack.com”
TTL: leave the default
   4. Save the record, make sure it is successfully added. 
   5. Go back to Smartlead.
   6. In the text box, fill in the details like this:
http://{host}.{yourdomain}


It should looks like this: 
  





   3. Configure the warmup settings.
