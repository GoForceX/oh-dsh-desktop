# Agent Note: Club community links in the landing footer

Status: implemented

English | [中文](2026-08-26-website-club-community-links.zh.md)

## Problem

The landing footer carried only the product tagline, so the site offered no
path to the club's QQ group or Discord server. The club's QQ share link alone
opens an intermediate join page rather than the group itself.

## Decision

The footer links both club communities next to the tagline. Discord points at
the invite the club publishes (`https://discord.gg/EMJqcQCCpW`). The QQ link
keeps the club's share page (`https://qm.qq.com/q/2uEd11lkWk`) as its `href`,
and a plain left click first navigates to
`mqqapi://card/show_pslcard?src_type=internal&version=1&uin=554359007&card_type=group&source=qrcode`,
which opens the group card directly in an installed QQ client; when no client
claims the scheme within two seconds, the share page opens instead. Modified
clicks and non-left buttons skip the handler and keep the native share-page
navigation.

## Alternatives considered

**Link only the share page.** Rejected because it inserts an intermediate page
before the group, which is the friction the club asked to remove.

**Expose only the mqqapi scheme.** Rejected because browsers without an
installed QQ client would face a dead link with no recovery path.

## Consequences

A plain click reaches the QQ group card in one hop wherever QQ is installed
and still lands on a working join page everywhere else. The scheme embeds the
group number (554359007) decoded from the club's share link, so the href and
the scheme drift apart only if someone edits one without the other; the
Discord invite is the club's own published URL and may rotate independently.
Both marks render inline with no new image assets, and the link labels ride
the site's existing translation table.

## Testing

`node --check website/site.js` passes. Clicking the footer QQ link in a
browser without a QQ client falls back to the club share page within two
seconds and lands on the QQ group join page; desktop and 390px mobile footer
screenshots render both links with intact icons. `node scripts/verify-agent-note-format.ts`,
`node scripts/verify-agent-note-classification.ts`, and `node scripts/verify-translation-pairing.ts` pass.
