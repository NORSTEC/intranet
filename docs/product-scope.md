# Product scope

## Purpose

The portal will provide Norstec with one authoritative system for membership,
roles, teams, alumni transitions, and access to connected services.

## Initial users

- Members of Norstec member organizations
- Member-organization administrators
- Portal administrators
- Alumni with limited access

## Membership lifecycle

![Membership lifecycle](diagrams/membership-lifecycle.png)

The detailed lifecycle and edge-case decisions are documented in
[Membership lifecycle](membership-lifecycle.md). Alumni is derived from ended
organization memberships; it is not a separate membership type.

## Proposed first release

- Sign in with Google
- Provision a first membership through an approved organization domain
- View and update a personal profile
- Manage organizations, teams, and roles
- End and reactivate organization memberships while retaining history
- Link multiple verified Google accounts to one portal profile
- Allow an alumnus with no active memberships to deactivate portal access
- Synchronize approved membership changes with Slack
- Record administrative and integration events in an audit log

## Explicit non-goals for the first release

- Membership-fee payments
- Vipps integration
- Expense reimbursement
- Annual-meeting administration
- Advanced alumni tracking
- Alumni applications for future organization memberships
- Automated lifecycle email notifications
- Self-service GDPR erasure
- Offering the portal as a product to member organizations

## Remaining product questions

- Which profile fields are required, optional, and visible to other members?
- How long should inactive and alumni data be retained?
- Which Slack channels follow each role or team?
- What verified workflow should link a personal email without sending test
  messages to real recipients?
- What legal-retention and anonymization rules should a future GDPR-erasure
  workflow follow?
