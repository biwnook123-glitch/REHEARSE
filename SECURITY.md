# Security Policy

## Supported versions

Security fixes currently target the latest release on the default branch.

## Reporting a vulnerability

Please do not open a public issue containing an exploit, private event material, credentials or personal data. Use GitHub's private vulnerability reporting after the repository is published. Until then, contact the repository owner privately.

Include the affected version, reproduction steps, impact and any suggested mitigation. You should receive an acknowledgement within seven days.

## Data boundary

REHEARSE parses imported files in the browser and does not ship a server-side upload endpoint. Browser local storage contains normalized project data and may therefore contain internal event details. Users should export and share project files with the same care as the source documents, and clear site data on shared computers.

Never add API keys or enterprise tokens to frontend source code.
