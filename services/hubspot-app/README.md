# HubSpot app for Dulcy's calendar connection (2025.2 project platform)

HubSpot no longer offers "legacy apps" on new developer accounts, so the OAuth app is a project
uploaded with the HubSpot CLI. Redirect URL and scopes match `services/dulcy-calendar` (HubSpot Meetings).

Upload (from the server, no local install needed):

    cd /opt/dulcy-os/services/hubspot-app
    docker run --rm -it -v "$PWD":/w -w /w node:22 bash -c "npm i -g @hubspot/cli >/dev/null && hs init && hs project upload"

`hs init` asks for a personal access key: HubSpot → Development → Keys → Personal access key.
Then in HubSpot: Development → Projects → dulcy-calendar → the app → Auth: copy Client ID + Client secret,
and save them with the provider command in engine/GUIDE.md ("More calendars"), PROVIDER=hubspot.
If the upload reports a config field error, fix that field here (HubSpot validates the schema on upload).
