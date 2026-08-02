## REMOVED Requirements

### Requirement: Mastodon image auto-resize（Mastodon 画像の自動リサイズ）

**Reason**: Mastodon 投稿対応の削除（#29）に伴い、対象機能そのものが消滅するため。本要件は capability 内で唯一の要件であり、削除により `image-upload` capability は廃止となる。

**Migration**: 不要。Bluesky の画像縮小処理（`bluesky_post.js` の 976,560 B 制限対応）は本 capability の対象外として実装されており、影響を受けない。Misskey は `misskey-posting` capability がリサイズを行わないことを規定済み。
