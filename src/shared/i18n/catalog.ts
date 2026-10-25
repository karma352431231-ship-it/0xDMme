/** Authored app text. Tuple order: English, Simplified Chinese. */
export const catalog: Record<string, readonly [string, string]> = {
  'Create public profile': ['Create public profile', '创建公开个人资料'],
  'Not now': ['Not now', '暂时不用'],

  'A public profile is required': [
    'A public profile is required',
    '需要公开个人资料',
  ],
  'Create a public profile to follow this community.': [
    'Create a public profile to follow this community.',
    '创建公开个人资料后即可关注此社区。',
  ],
  'Create a public profile to follow this profile.': [
    'Create a public profile to follow this profile.',
    '创建公开个人资料后即可关注此用户。',
  ],
  'Create a public profile to publish a post.': [
    'Create a public profile to publish a post.',
    '创建公开个人资料后即可发帖。',
  ],
  'Create a public profile to create a community.': [
    'Create a public profile to create a community.',
    '创建公开个人资料后即可创建社区。',
  ],
  'Open account settings to sign in and create your public profile.': [
    'Open account settings to sign in and create your public profile.',
    '打开账户设置以登录并创建公开个人资料。',
  ],

  'Message deletion or authorization changed. Reconcile the affected history.':
    [
      'Message deletion or authorization changed. Reconcile the affected history.',
      '消息删除或授权发生变化。正在重新核对相关历史记录。',
    ],
  'Some conversations need key recovery or renewed consent. Other conversations continue syncing.':
    [
      'Some conversations need key recovery or renewed consent. Other conversations continue syncing.',
      '部分对话需要恢复密钥或重新授权，其他对话会继续同步。',
    ],
  'ranking.reload': ['Reload from the start', '从头重新加载'],
  'ranking.overall': ['Rankings', '排行榜'],
  'ranking.scope': ['Ranking category', '排行榜类别'],
  'ranking.users': ['Users', '用户'],
  'ranking.user': ['User', '用户'],
  'ranking.partial-history': [
    'Collecting activity; this period is not complete yet.',
    '正在收集活动数据；此时段的数据尚不完整。',
  ],
  'ranking.received-summary {0} {1} {2} {3}': [
    '{0} views · {1} upvotes · {2} comments · {3} share clicks',
    '{0} 次浏览 · {1} 次赞 · {2} 条评论 · {3} 次分享点击',
  ],
  'ranking.share-count-failed': [
    'Sharing is available, but this click could not be counted.',
    '仍可分享，但未能计入此次点击。',
  ],
  'Ranking uses 24 hours, 7 days or 30 days.': [
    'Ranking uses 24 hours, 7 days or 30 days.',
    '排行榜支持 24 小时、7 天或 30 天。',
  ],
  'Profile page too large.': [
    'Profile page too large.',
    '用户页面超出大小限制。',
  ],
  'Share counts unavailable.': [
    'Share counts unavailable.',
    '分享计数暂不可用。',
  ],
  'contacts.settings-saved-refresh-failed': [
    'Contact saved. The contact list could not refresh; reopen Contacts to check it.',
    '联系人已保存，但联系人列表无法刷新；请重新打开联系人页面查看。',
  ],
  'html.contact-settings': [
    '<header><div><span class="contact-eyebrow">YOUR CONTACTS</span><h2 id="contact-settings-title">Contact settings</h2></div><button data-contact-settings-close class="contact-close" type="button" aria-label="Close contact settings">{0}</button></header><form><div class="contact-settings-identity"><strong data-contact-name></strong><p data-contact-identity></p></div><label>Private nickname<input data-contact-alias maxlength="80" autocomplete="off"></label><p class="contact-hint">Only you see this name. Saving does not send or accept a chat request.</p><div data-contact-versions></div><button type="submit" class="primary">Save changes</button><p data-contact-settings-status role="status"></p></form>',
    '<header><div><span class="contact-eyebrow">你的联系人</span><h2 id="contact-settings-title">联系人设置</h2></div><button data-contact-settings-close class="contact-close" type="button" aria-label="关闭联系人设置">{0}</button></header><form><div class="contact-settings-identity"><strong data-contact-name></strong><p data-contact-identity></p></div><label>私密备注名<input data-contact-alias maxlength="80" autocomplete="off"></label><p class="contact-hint">只有你能看到此名称。保存不会发送或接受聊天申请。</p><div data-contact-versions></div><button type="submit" class="primary">保存更改</button><p data-contact-settings-status role="status"></p></form>',
  ],
  'Added via invitation': ['Added via invitation', '通过邀请添加'],
  'Contact origin not recorded': [
    'Contact origin not recorded',
    '未记录联系人的添加方式',
  ],
  'Resolve saved versions': ['Resolve saved versions', '解决已保存版本冲突'],
  'Contact changes saved.': ['Contact changes saved.', '联系人更改已保存。'],
  'Who can request a private chat': [
    'Who can request a private chat',
    '谁可以申请私密聊天',
  ],
  'Invite people yourself': ['Invite people yourself', '由你主动分享邀请'],
  'Let people find your exact wallet': [
    'Let people find your exact wallet',
    '允许通过完整钱包地址找到你',
  ],
  'Stop new chat requests': ['Stop new chat requests', '停止接收新的聊天申请'],
  'Explain: {0}': ['Explain: {0}', '说明：{0}'],
  'Only people with your active invitation link can find your private account and request a chat. You choose whether to accept. Replacing or revoking the link stops new requests through the old link. Approved contacts keep access.':
    [
      'Only people with your active invitation link can find your private account and request a chat. You choose whether to accept. Replacing or revoking the link stops new requests through the old link. Approved contacts keep access.',
      '只有持有你的有效邀请链接的人才能找到你的私密账户并申请聊天。由你决定是否接受。更换或撤销链接后，旧链接无法发起新申请。已批准联系人仍可与你聊天。',
    ],
  'Anyone with your complete wallet address or active invitation link can find your private account and request a chat. You must accept before they can message you. This does not publish your wallet in a directory.':
    [
      'Anyone with your complete wallet address or active invitation link can find your private account and request a chat. You must accept before they can message you. This does not publish your wallet in a directory.',
      '知道你的完整钱包地址或持有有效邀请链接的人可以找到你的私密账户并申请聊天。你接受后，对方才能发送消息。这不会将你的钱包发布到公开目录。',
    ],
  'Only contacts you have already approved can chat with you. New requests are disabled, including requests through your invitation link or exact wallet address. Existing contacts stay approved.':
    [
      'Only contacts you have already approved can chat with you. New requests are disabled, including requests through your invitation link or exact wallet address. Existing contacts stay approved.',
      '只有你已批准的联系人可以与你聊天。停止接收所有新申请，包括通过邀请链接或完整钱包地址发起的申请。现有联系人保持已批准状态。',
    ],
  'calls.test-tone-explanation': [
    'Sends one quiet, generated beep to the other person instead of your microphone for about one second, then restores your microphone. It records nothing. Available only with your microphone on.',
    '用一个轻柔的合成提示音代替麦克风音频发送给对方，持续约一秒，然后恢复麦克风。不录制任何内容。仅在麦克风开启时可用。',
  ],
  'calls.test-tone-send': ['Send one test beep', '发送一个测试提示音'],
  'calls.test-tone-sending': [
    'Sending one test beep…',
    '正在发送一个测试提示音…',
  ],
  'calls.test-tone-sent': [
    'Test finished; microphone restored.',
    '测试结束，麦克风已恢复。',
  ],
  'calls.test-tone-failed': [
    'Audio test could not finish. End this call before trying again.',
    '无法完成音频测试。请结束本次通话后重试。',
  ],
  'calls.audio-check-stop-capture': [
    'Test listening without microphone',
    '测试关闭麦克风后的收听',
  ],
  'calls.audio-check-stop-capture-explanation': [
    'For diagnosis: closes this microphone until you end the call. You can still hear the other person, but they will not hear you. Start a new call to speak again.',
    '仅用于诊断：关闭本次通话的麦克风，直到通话结束。你仍能听到对方，但对方将听不到你。要再次说话，请开始新通话。',
  ],
  'calls.audio-check-stopping-capture': [
    'Closing microphone…',
    '正在关闭麦克风…',
  ],
  'calls.capture-stopped': [
    'Audio test: microphone closed until this call ends. You can still hear the other person.',
    '音频测试：麦克风已关闭，直到本次通话结束。你仍能听到对方。',
  ],
  'calls.audio-check-stop-failed': [
    'Could not finish the microphone test. End this call before trying again.',
    '无法完成麦克风测试。请结束本次通话后重试。',
  ],
  'calls.audio-check': ['Audio check', '音频检查'],
  'calls.audio-check-privacy': [
    'Checks technical counters and microphone settings in this tab. Includes no audio, messages, addresses or credentials. Nothing is sent automatically.',
    '仅在此标签页检查技术计数和麦克风设置。不包含音频、消息、地址或凭证。不会自动发送任何内容。',
  ],
  'calls.audio-check-run': ['Check call audio', '检查通话音频'],
  'calls.audio-check-copy': ['Copy report', '复制报告'],
  'calls.audio-check-report': [
    'Call audio technical report',
    '通话音频技术报告',
  ],
  'calls.audio-check-running': ['Checking audio…', '正在检查音频…'],
  'calls.audio-check-ready': [
    'Report ready. Copy it only if you want to share it for support.',
    '报告已生成。仅在你希望向支持人员分享时复制。',
  ],
  'calls.audio-check-failed': [
    'Could not check audio. Keep the call connected and try again.',
    '无法检查音频。请保持通话连接后重试。',
  ],
  'calls.audio-check-copied': ['Report copied.', '报告已复制。'],
  'calls.audio-check-copy-failed': [
    'Could not copy. Select and copy the report manually.',
    '无法复制。请手动选择并复制报告。',
  ],
  'chat.outgoing-message': ['Your message', '你的消息'],
  'chat.composed-at {0}': ['Written at {0}', '撰写于 {0}'],
  'chat.send-failed': [
    'Message could not be sent. Try again.',
    '消息未能发送。请重试。',
  ],
  'chat.retry-send': ['Retry sending message', '重试发送消息'],
  'chat.saving-local': [
    'Saving message on this device…',
    '正在将消息保存到此设备…',
  ],
  'chat.save-failed': [
    'Message not saved. Retry before closing this page.',
    '消息尚未保存。请在关闭此页面前重试。',
  ],
  'chat.retry-save': ['Retry saving message', '重试保存消息'],
  'preview.audio': ['Voice message', '语音消息'],
  'preview.unavailable': ['Message preview unavailable.', '无法显示消息预览。'],
  'Message action target is unavailable.': [
    'This message is no longer available for this action.',
    '此消息已无法进行此操作。',
  ],
  'Message action limit reached.': [
    'This message has reached its edit and reaction limit.',
    '该消息的编辑和回应次数已达上限。',
  ],
  'Invalid public-identity message or action.': [
    'This message or action is unavailable in handle chats.',
    '用户名聊天中不支持此消息或操作。',
  ],
  'message.sent-at {0}': ['Sent at {0}', '发送于 {0}'],
  'message.remove-reaction {0} {1}': [
    'Remove my {0} reaction · {1}',
    '移除我的 {0} 回应 · {1}',
  ],
  'message.reaction {0} {1}': ['{0} reaction · {1}', '{0} 回应 · {1}'],
  'forward.choose-contact': ['Forward to', '转发至'],
  'forward.more': ['Load more contacts', '加载更多联系人'],
  'forward.search': ['Search contacts', '搜索联系人'],
  'forward.empty': ['No approved contacts found.', '未找到已批准的联系人。'],
  'forward.photo-unavailable': [
    'Contact photo unavailable.',
    '无法显示联系人照片。',
  ],
  'forward.contacts-unavailable': [
    'Could not load contacts.',
    '无法加载联系人。',
  ],
  'forward.selected {0}': ['{0} selected', '已选择 {0} 条'],
  'forward.select-message': ['Select message to forward', '选择要转发的消息'],
  'forward.pending-target': [
    'Retry forwarding to the same contact to finish the pending send.',
    '请重试转发给同一联系人，以完成待发送的消息。',
  ],
  'Invalid message time.': ['Invalid message time.', '消息时间无效。'],
  'Invalid message presentation.': [
    'Invalid message presentation.',
    '消息显示信息无效。',
  ],
  'Invalid message reaction.': ['Invalid message reaction.', '消息回应无效。'],
  'Reaction target is unavailable.': [
    'The message is no longer available for reactions.',
    '该消息已无法回应。',
  ],
  'Message reaction limit reached.': [
    'This message has reached its reaction limit.',
    '该消息的回应次数已达上限。',
  ],
  'DM accepts text, declared media and reactions; private profile and edits are forbidden.':
    [
      'This chat accepts text, media and reactions; private profile cards and edits are unavailable.',
      '此聊天支持文字、媒体和回应，不支持私密资料卡和编辑。',
    ],
  'follow.community': ['Community', '社区'],
  'follow.user': ['User', '用户'],
  'upvote.heading': ['Upvotes', '赞同'],
  '@{0} upvoted your post': ['@{0} upvoted your post', '@{0} 赞同了你的帖子'],
  '@{0} and {1} others upvoted your post': [
    '@{0} and {1} others upvoted your post',
    '@{0} 和其他 {1} 人赞同了你的帖子',
  ],
  '@{0} upvoted your reply': ['@{0} upvoted your reply', '@{0} 赞同了你的回复'],
  '@{0} and {1} others upvoted your reply': [
    '@{0} and {1} others upvoted your reply',
    '@{0} 和其他 {1} 人赞同了你的回复',
  ],
  'upvote.show': ['View who upvoted', '查看赞同者'],
  'upvote.more': ['Next page', '下一页'],
  'upvote.loading': ['Loading upvotes…', '正在加载赞同…'],
  'upvote.empty': ['No upvotes yet.', '暂无赞同。'],
  'Invalid upvote notice.': ['Invalid upvote notice.', '赞同通知无效。'],
  'Upvote read unavailable.': [
    'Could not mark upvotes as read.',
    '无法将赞同标记为已读。',
  ],

  'post.edited': [' · Edited', ' · 已编辑'],
  'thread.load-remaining': ['Load remaining replies', '加载其余回复'],
  'Invalid discussion preview.': [
    'Invalid discussion preview.',
    '回复预览无效。',
  ],
  'Top voted reply': ['Top voted reply', '获赞最高的回复'],
  '＋ View 1 more reply': ['＋ View 1 more reply', '＋ 查看另外 1 条回复'],
  'activity.now': ['Now', '刚刚'],
  'contacts.request-sent-save-failed': [
    'Request sent, but the contact could not be saved. Refresh contacts before trying again.',
    '请求已发送，但无法保存联系人。请刷新联系人后再试。',
  ],
  '{0} loaded': ['{0} loaded', '已加载 {0} 个'],
  'contacts.edit': ['Edit contact', '编辑联系人'],
  'contacts.waiting': [
    'Request sent · Waiting for acceptance',
    '请求已发送 · 等待接受',
  ],
  'contacts.saved-only': [
    'Saved contact · Conversation not yet approved',
    '已保存联系人 · 聊天尚未获准',
  ],
  'contacts.empty': [
    'No contacts in the loaded items. Add a contact or send an invitation.',
    '已加载的项目中没有联系人。请添加联系人或发送邀请。',
  ],

  'Community topics · {0}/2 selected (required)': [
    'Community topics · {0}/2 selected (required)',
    '社区主题 · 已选 {0}/2（必选）',
  ],
  'community.topics.filter': ['Filter by topic', '按主题筛选'],
  'community.topics.toggle': ['Topics', '主题'],
  'community.topics.toggle-count {0}': ['Topics · {0}', '主题 · {0}'],
  'Invalid publication mode.': ['Invalid publication mode.', '发布模式无效。'],
  'community.content-policy': [
    'Mark your community NSFW if it will contain sexually explicit content, including AI-generated images or drawings. Keep explicit content out of unmarked communities.',
    '如果社区将包含露骨色情内容（包括 AI 生成的图片或绘画），请将其标记为 NSFW。未标记的社区不得发布露骨内容。',
  ],
  'community.nsfw.label': ['NSFW · Explicit content', 'NSFW · 露骨内容'],
  'community.nsfw.hint': [
    'Enable this if your community will contain sexually explicit content, including AI-generated images or drawings.',
    '如果社区将包含露骨色情内容（包括 AI 生成的图片或绘画），请启用此选项。',
  ],
  'community.nsfw.save': ['Save NSFW designation', '保存 NSFW 标记'],
  'community.topics.title': [
    'What is this community about?',
    '这个社区的主题是什么？',
  ],
  'community.topics.fixed-hint': [
    'Choose one or two topics. They cannot be changed after creation.',
    '请选择一至两个主题。创建后无法更改。',
  ],
  'community.publication.unreviewed': [
    'Published without automatic analysis. Automatic moderation is temporarily paused.',
    '已发布，未进行自动分析。自动审核已暂时停用。',
  ],
  'community.publication.images': [
    'Images are published after file preparation. Automatic content analysis is temporarily paused.',
    '图片将在文件处理完成后发布。自动内容分析已暂时停用。',
  ],
  'community.publication.preview': [
    'Changes stay as a preview on this device until you confirm. Confirmed images are published without automatic content analysis.',
    '更改在确认前仅在此设备上预览。确认后的图片将直接发布，不进行自动内容分析。',
  ],
  'Choose at least one community topic.': [
    'Choose at least one community topic.',
    '请至少选择一个社区主题。',
  ],
  'Invalid community topics.': [
    'Choose distinct topics from the available list. New communities can have up to two topics.',
    '请选择列表中不同的主题。新社区最多可选择两个主题。',
  ],
  'Invalid NSFW choice.': [
    'Choose whether this community contains explicit content.',
    '请选择此社区是否包含露骨内容。',
  ],
  'Community page too large.': ['Community page too large.', '社区页面过大。'],
  'Community creation classification already fixed.': [
    'This creation request already has different fixed topics or NSFW settings.',
    '此创建请求已有不同的固定主题或 NSFW 设置。',
  ],
  'Classification is available only for new communities.': [
    'Classification is available only for new communities.',
    '分类仅适用于新创建的社区。',
  ],
  'community.topic.ai': ['AI', 'AI'],
  'community.topic.cat': ['Cat', '猫'],
  'community.topic.dog': ['Dog', '狗'],
  'community.topic.meme': ['Meme', '表情包'],
  'community.topic.tech': ['Tech', '科技'],
  'community.topic.stock': ['Stock', '股票'],
  'community.topic.chinese': ['Chinese', '中文'],
  'community.topic.brainrot': ['BrainRot', '抽象梗'],
  'community.topic.celebrity': ['Celebrity', '名人'],
  'community.topic.nft': ['NFT', 'NFT'],
  'community.topic.tiktok': ['TikTok', 'TikTok'],
  'community.topic.games': ['Games', '游戏'],
  'Review media unavailable.': [
    'Review media unavailable.',
    '分析媒体不可用。',
  ],
  'Loading media…': ['Loading media…', '正在加载媒体…'],
  'Media restricted to your account': [
    'Media restricted to your account',
    '仅限你的账号查看的媒体',
  ],
  'This file is no longer available. It may have been replaced, removed, or reached its retention deadline.':
    [
      'This file is no longer available. It may have been replaced, removed, or reached its retention deadline.',
      '此文件已不可用。它可能已被替换、移除或达到保留期限。',
    ],
  'community.profile-invitation.title': [
    'Want to participate?',
    '想参与讨论？',
  ],
  'community.profile-invitation.link': [
    'Create your public profile here',
    '在此创建你的公开个人资料',
  ],
  'wallet.available': ['Available', '可用'],
  'wallet.not-detected': ['Not detected', '未检测到'],
  'Language saved.': ['Language saved.', '语言已保存。'],
  ', which you follow': [', which you follow', '，你已关注'],
  ': heartbeat': [': heartbeat', '：心跳'],
  '{0} — {1}': ['{0} — {1}', '{0} — {1}'],
  '{0} · {1}': ['{0} · {1}', '{0} · {1}'],
  '{0} · {1} · {2}': ['{0} · {1} · {2}', '{0} · {1} · {2}'],
  '{0} · {1} queued': ['{0} · {1} queued', '{0} · 队列中有 {1} 项'],
  '{0} · {1}. Only confirm a request you started. Your wallet will ask for signatures to sign in and open your encrypted data in the original browser. No transaction or token approval is requested.':
    [
      '{0} · {1}. Only confirm a request you started. Your wallet will ask for signatures to sign in and open your encrypted data in the original browser. No transaction or token approval is requested.',
      '{0} · {1}。请仅确认你自己发起的请求。钱包将请求签名，以登录并在原浏览器中打开加密数据。这不会发起交易或授权代币。',
    ],
  '{0} · {1}. User-chosen name.': [
    '{0} · {1}. User-chosen name.',
    '{0} · {1}。用户自行设置的名称。',
  ],
  '{0} · {1}{2}': ['{0} · {1}{2}', '{0} · {1}{2}'],
  '{0} · #{1} · {2}': ['{0} · #{1} · {2}', '{0} · #{1} · {2}'],
  '{0} · 0xDMme': ['{0} · 0xDMme', '{0} · 0xDMme'],
  '{0} · fingerprint {1}': ['{0} · fingerprint {1}', '{0} · 指纹 {1}'],
  '{0} · inference {1} s': ['{0} · inference {1} s', '{0} · 推理耗时 {1} 秒'],
  '{0} · user-chosen name · {1} · {2}': [
    '{0} · user-chosen name · {1} · {2}',
    '{0} · 用户自行设置的名称 · {1} · {2}',
  ],
  '{0} · version {1}': ['{0} · version {1}', '{0} · 版本 {1}'],
  '{0} [{1} · {2} · {3} · {4}]': [
    '{0} [{1} · {2} · {3} · {4}]',
    '{0} [{1} · {2} · {3} · {4}]',
  ],
  '{0} {1}': ['{0} {1}', '{0} {1}'],
  '{0} {1} {2}': ['{0} {1} {2}', '{0} {1} {2}'],
  '{0} {1}.': ['{0} {1}.', '{0} {1}。'],
  '{0} {1}{2}': ['{0} {1}{2}', '{0} {1}{2}'],
  '{0} the community {1}': ['{0} the community {1}', '{0}社区 {1}'],
  '{0} cases · {1} MiB · expires by {2}.': [
    '{0} cases · {1} MiB · expires by {2}.',
    '{0} 个案例 · {1} MiB · 将于 {2} 前过期。',
  ],
  '{0} invited you to a group': [
    '{0} invited you to a group',
    '{0} 邀请你加入群组',
  ],
  '{0} invited you to a group.': [
    '{0} invited you to a group.',
    '{0} 邀请你加入群组。',
  ],
  '{0} of {1}': ['{0} of {1}', '{0} / {1}'],
  '{0} in {1}': ['{0} in {1}', '{0}，来自 {1}'],
  '{0} GB': ['{0} GB', '{0} GB'],
  '{0} MB': ['{0} MB', '{0} MB'],
  '{0} MB used · {1} MB available out of {2} MB': [
    '{0} MB used · {1} MB available out of {2} MB',
    '已使用 {0} MB · 总共 {2} MB，可用 {1} MB',
  ],
  '{0} unread messages': ['{0} unread messages', '{0} 条未读消息'],
  '{0} No audio was sent automatically.': [
    '{0} No audio was sent automatically.',
    '{0} 没有自动发送任何音频。',
  ],
  '{0} offered you ownership of a group': [
    '{0} offered you ownership of a group',
    '{0} 向你转让群组所有权',
  ],
  '{0} offered you ownership of a group. Accept to take over administration.': [
    '{0} offered you ownership of a group. Accept to take over administration.',
    '{0} 向你转让群组所有权。接受后，你将负责管理该群组。',
  ],
  '{0} participants': ['{0} participants', '{0} 位成员'],
  '{0} posts · {1} replies': [
    '{0} posts · {1} replies',
    '{0} 篇帖子 · {1} 条回复',
  ],
  '{0} Revision: {1}': ['{0} Revision: {1}', '{0} 修订版本：{1}'],
  '{0} saved · {1} pass · {2} blocked · expires at {3} (Fortaleza)': [
    '{0} saved · {1} pass · {2} blocked · expires at {3} (Fortaleza)',
    '已保存 {0} 项 · 通过 {1} 项 · 拦截 {2} 项 · {3} 到期（福塔莱萨时间）',
  ],
  '{0} followers': ['{0} followers', '{0} 位关注者'],
  '{0} conflicting versions': ['{0} conflicting versions', '{0} 个冲突版本'],
  '{0} estimated views': ['{0} estimated views', '约 {0} 次浏览'],
  '{0} votes': ['{0} votes', '{0} 票'],
  '{0}: {1}': ['{0}: {1}', '{0}：{1}'],
  '{0}: {1} — {2}': ['{0}: {1} — {2}', '{0}：{1} — {2}'],
  '{0}:{1} unavailable': ['{0}:{1} unavailable', '{0}:{1} 不可用'],
  '{0}. {1}': ['{0}. {1}', '{0}。{1}'],
  '{0}. Source account: {1} ({2}). Package ID: {3}.': [
    '{0}. Source account: {1} ({2}). Package ID: {3}.',
    '{0}。来源账户：{1}（{2}）。数据包标识：{3}。',
  ],
  '{0}{1} · {2}': ['{0}{1} · {2}', '{0}{1} · {2}'],
  '{0}{1} · {2}{3}{4}{5}': ['{0}{1} · {2}{3}{4}{5}', '{0}{1} · {2}{3}{4}{5}'],
  '{0}{1} · saved in contacts': [
    '{0}{1} · saved in contacts',
    '{0}{1} · 已保存到联系人',
  ],
  '{0}{1} on this page': ['{0}{1} on this page', '此页面上的 {0}{1}'],
  'Public profile handle': ['Public profile handle', '公开个人资料用户名'],
  'Public handle': ['Public handle', '公开用户名'],
  '@{0} {1}': ['@{0} {1}', '@{0} {1}'],
  '@{0} mentioned you': ['@{0} mentioned you', '@{0} 提到了你'],
  '@{0} wants to chat with you.': [
    '@{0} wants to chat with you.',
    '@{0} 想与你聊天。',
  ],
  '@{0}, {1}': ['@{0}, {1}', '@{0}，{1}'],
  '← {0}': ['← {0}', '← {0}'],
  'Back to feed': ['Back to feed', '返回动态'],
  '← Back to Activity': ['← Back to Activity', '← 返回活动'],
  '+ Follow': ['+ Follow', '+ 关注'],
  '＋ View {0} {1}': ['＋ View {0} {1}', '＋ 查看 {0} 条{1}'],
  '＋ View {0} more replies': [
    '＋ View {0} more replies',
    '＋ 查看另外 {0} 条回复',
  ],
  '＋ View {0} replies': ['＋ View {0} replies', '＋ 查看 {0} 条回复'],
  '×': ['×', '×'],
  '− Collapse replies': ['− Collapse replies', '− 收起回复'],
  '⌄': ['⌄', '⌄'],
  '0 0 {0} {1}': ['0 0 {0} {1}', '0 0 {0} {1}'],
  '1 day': ['1 day', '1 天'],
  '24 hours': ['24 hours', '24 小时'],
  '30 days': ['30 days', '30 天'],
  '7 days': ['7 days', '7 天'],
  'The action was not completed.': [
    'The action was not completed.',
    '操作未完成。',
  ],
  'Administration only changes after you accept.': [
    'Administration only changes after you accept.',
    '只有你接受后，管理权才会转移。',
  ],
  'Contacts have changed. Refresh the list before continuing.': [
    'Contacts have changed. Refresh the list before continuing.',
    '联系人已更改。请刷新列表后继续。',
  ],
  'Automated analysis detected explicit content, which is prohibited by the public content policy. You can appeal in Profile.':
    [
      'Automated analysis detected explicit content, which is prohibited by the public content policy. You can appeal in Profile.',
      '自动分析检测到公开内容政策禁止的露骨内容。你可以在“个人资料”中申诉。',
    ],
  'Automated analysis was not completed.': [
    'Automated analysis was not completed.',
    '自动分析未完成。',
  ],
  'The analysis was uncertain. The content will not be public until approved. You can appeal in Profile.':
    [
      'The analysis was uncertain. The content will not be public until approved. You can appeal in Profile.',
      '分析结果不确定。在获批前，内容不会公开。你可以在“个人资料”中申诉。',
    ],
  'Analysis rejected this file because it detected explicit content.': [
    'Analysis rejected this file because it detected explicit content.',
    '分析检测到露骨内容，因此拒绝了此文件。',
  ],
  'The signature does not belong to the test account.': [
    'The signature does not belong to the test account.',
    '签名不属于测试账户。',
  ],
  'The signature belongs to another wallet.': [
    'The signature belongs to another wallet.',
    '签名属于另一个钱包。',
  ],
  'device authorization in Profile → Connected devices': [
    'device authorization in Profile → Connected devices',
    '“个人资料 → 已连接设备”中的设备授权',
  ],
  'Authorization changed during signing. Cancel and check again.': [
    'Authorization changed during signing. Cancel and check again.',
    '签名期间授权已更改。请取消并重新确认。',
  ],
  "Authorization changed. The app is checking the device's current state.": [
    "Authorization changed. The app is checking the device's current state.",
    '授权已更改。应用正在检查设备的当前状态。',
  ],
  'The assessment applies to the media identified on this page. An appeal requests a review of this result.':
    [
      'The assessment applies to the media identified on this page. An appeal requests a review of this result.',
      '评估仅适用于此页面标识的媒体。提交申诉可请求复核该结果。',
    ],
  'The camera was stopped. Try again or copy the code.': [
    'The camera was stopped. Try again or copy the code.',
    '摄像头已关闭。请重试或复制代码。',
  ],
  'the ongoing call': ['the ongoing call', '正在进行的通话'],
  "The other client's key does not match.": [
    "The other client's key does not match.",
    '另一个客户端的密钥不匹配。',
  ],
  'The community has changed.': ['The community has changed.', '社区已更改。'],
  'This account does not have a recovery key yet.': [
    'This account does not have a recovery key yet.',
    '此账户尚未设置恢复密钥。',
  ],
  'The account changed before settings were saved.': [
    'The account changed before settings were saved.',
    '保存设置前，账户已更改。',
  ],
  "The selected account is not the package's account.": [
    "The selected account is not the package's account.",
    '所选账户与数据包所属账户不一致。',
  ],
  'This conversation was blocked. The excerpt is preserved only as a local preview.':
    [
      'This conversation was blocked. The excerpt is preserved only as a local preview.',
      '此对话已被屏蔽。片段仅保留为本地预览。',
    ],
  'The saved copy is outside the vault and bilateral deletion. Only open files from sources you trust.':
    [
      'The saved copy is outside the vault and bilateral deletion. Only open files from sources you trust.',
      '保存的副本不在保险库内，也不受双方删除机制影响。请仅打开来自可信来源的文件。',
    ],
  'The saved copy is outside the vault and personal cleanup. Only open files from sources you trust.':
    [
      'The saved copy is outside the vault and personal cleanup. Only open files from sources you trust.',
      '保存的副本不在保险库内，也不受个人清理机制影响。请仅打开来自可信来源的文件。',
    ],
  'Community managers review the local report. Your identity is not shown in the response delivered to them. You can track the review below.':
    [
      'Community managers review the local report. Your identity is not shown in the response delivered to them. You can track the review below.',
      '社区管理员会审核本地举报。发送给他们的响应不会显示你的身份。你可以在下方查看审核进度。',
    ],
  'public profile editing in Profile → Public profile': [
    'public profile editing in Profile → Public profile',
    '“个人资料 → 公开个人资料”中的编辑',
  ],
  'editing in Contacts': ['editing in Contacts', '“联系人”中的编辑'],
  'The sign-in expired. Connect your wallet again.': [
    'The sign-in expired. Connect your wallet again.',
    '登录已过期。请重新连接钱包。',
  ],
  'account sign-in or private profile editing in Profile': [
    'account sign-in or private profile editing in Profile',
    '“个人资料”中的账户登录或私密个人资料编辑',
  ],
  'This choice follows your account.': [
    'This choice follows your account.',
    '此选项将随账户同步。',
  ],
  'The queue must stay within 512 MiB.': [
    'The queue must stay within 512 MiB.',
    '队列大小不得超过 512 MiB。',
  ],
  'The community photo was withheld from public view': [
    'The community photo was withheld from public view',
    '社区图片未公开展示',
  ],
  'The gallery is full. Export and delete the round before uploading more images.':
    [
      'The gallery is full. Export and delete the round before uploading more images.',
      '图库已满。请先导出并删除本轮数据，再上传更多图片。',
    ],
  'The cryptographic identity changed. Compare it with your contact through an independent channel before accepting new keys.':
    [
      'The cryptographic identity changed. Compare it with your contact through an independent channel before accepting new keys.',
      '加密身份已更改。接受新密钥前，请通过独立渠道与联系人核对。',
    ],
  'The saved image differs from the upload. The queue was preserved.': [
    'The saved image differs from the upload. The queue was preserved.',
    '保存的图片与上传内容不一致。队列已保留。',
  ],
  'Microphone initialization was interrupted. Check the preserved excerpt.': [
    'Microphone initialization was interrupted. Check the preserved excerpt.',
    '麦克风初始化已中断。请检查保留的片段。',
  ],
  'The device list changed. Review your choice again.': [
    'The device list changed. Review your choice again.',
    '设备列表已更改。请重新确认所选设备。',
  ],
  'The group list changed. Refresh it.': [
    'The group list changed. Refresh it.',
    '群组列表已更改。请刷新。',
  ],
  'the vault operation in Profile → Vault and backup': [
    'the vault operation in Profile → Vault and backup',
    '“个人资料 → 保险库与备份”中的操作',
  ],
  'the operation in Activity': ['the operation in Activity', '“活动”中的操作'],
  'the operation in Organizations and representatives': [
    'the operation in Organizations and representatives',
    '“组织与代表”中的操作',
  ],
  'the operation or editing in Communities': [
    'the operation or editing in Communities',
    '“社区”中的操作或编辑',
  ],
  'Group membership changed. Refresh it.': [
    'Group membership changed. Refresh it.',
    '群组成员已更改。请刷新。',
  ],
  'The post was deleted. Its previous content is not retained.': [
    'The post was deleted. Its previous content is not retained.',
    '帖子已删除。之前的内容不会保留。',
  ],
  'publishing in My status': ['publishing in My status', '“我的状态”中的发布'],
  'Recovery is already configured.': [
    'Recovery is already configured.',
    '恢复功能已配置。',
  ],
  'Recovery changed during sign-in. Start again.': [
    'Recovery changed during sign-in. Start again.',
    '登录期间恢复设置已更改。请重新开始。',
  ],
  'The round reached its limit. Images already uploaded are preserved.': [
    'The round reached its limit. Images already uploaded are preserved.',
    '本轮已达到上限。已上传的图片会继续保留。',
  ],
  'The round expired. Temporary images were discarded.': [
    'The round expired. Temporary images were discarded.',
    '本轮已过期。临时图片已清除。',
  ],
  'The session is connected. Open your account to authorize the keys in this browser.':
    [
      'The session is connected. Open your account to authorize the keys in this browser.',
      '会话已连接。请打开账户，以在此浏览器中授权密钥。',
    ],
  'The connection request was rejected in the wallet.': [
    'The connection request was rejected in the wallet.',
    '钱包已拒绝连接请求。',
  ],
  'The recipient must accept the transfer. After acceptance, you become a participant and lose management access.':
    [
      'The recipient must accept the transfer. After acceptance, you become a participant and lose management access.',
      '转让需要接收者接受。接受后，你将成为普通成员并失去管理权限。',
    ],
  'The previous version was removed. Create a new version explicitly.': [
    'The previous version was removed. Create a new version explicitly.',
    '先前的版本已移除。如需新版本，请主动创建。',
  ],
  'The version was already confirmed. No accepted data was discarded.': [
    'The version was already confirmed. No accepted data was discarded.',
    '该版本已确认。没有丢弃任何已接受的数据。',
  ],
  'The wallet has not signed yet.': [
    'The wallet has not signed yet.',
    '钱包尚未签名。',
  ],
  'The wallet changed the sign-in request.': [
    'The wallet changed the sign-in request.',
    '钱包更改了登录请求。',
  ],
  'The wallet returned a Solana account with an invalid address or public key.':
    [
      'The wallet returned a Solana account with an invalid address or public key.',
      '钱包返回的 Solana 账户地址或公钥无效。',
    ],
  'The wallet produced different signatures. Use another device authorized by QR; recovery was not configured in this attempt.':
    [
      'The wallet produced different signatures. Use another device authorized by QR; recovery was not configured in this attempt.',
      '钱包生成的签名不一致。请使用另一台通过二维码授权的设备；本次尝试未配置恢复功能。',
    ],
  'The wallet did not authorize this page to connect.': [
    'The wallet did not authorize this page to connect.',
    '钱包未授权此页面连接。',
  ],
  'The wallet did not complete signing. Try again.': [
    'The wallet did not complete signing. Try again.',
    '钱包未完成签名。请重试。',
  ],
  'The wallet did not complete the Solana connection.': [
    'The wallet did not complete the Solana connection.',
    '钱包未完成 Solana 连接。',
  ],
  'The wallet did not finish within two minutes. Reload before trying again.': [
    'The wallet did not finish within two minutes. Reload before trying again.',
    '钱包未在两分钟内完成。请刷新后重试。',
  ],
  'The wallet did not complete the request. Close or reject the request in your wallet before trying again.':
    [
      'The wallet did not complete the request. Close or reject the request in your wallet before trying again.',
      '钱包未完成请求。请先在钱包中关闭或拒绝该请求，再重试。',
    ],
  'The wallet rejected the Solana connection method.': [
    'The wallet rejected the Solana connection method.',
    '钱包拒绝了 Solana 连接方式。',
  ],
  'The wallet rejected the Solana connection parameters.': [
    'The wallet rejected the Solana connection parameters.',
    '钱包拒绝了 Solana 连接参数。',
  ],
  'Account opening': ['Account opening', '打开账户'],
  'Open the connected group before changing its photo.': [
    'Open the connected group before changing its photo.',
    '请先打开已连接的群组，再更换图片。',
  ],
  'Open and sync contacts to start chatting.': [
    'Open and sync contacts to start chatting.',
    '请打开并同步联系人后开始聊天。',
  ],
  'Open your account to change privacy settings.': [
    'Open your account to change privacy settings.',
    '请打开账户以更改隐私设置。',
  ],
  'Open your account to confirm the profile.': [
    'Open your account to confirm the profile.',
    '请打开账户以确认个人资料。',
  ],
  'Open a connected group first.': [
    'Open a connected group first.',
    '请先打开已连接的群组。',
  ],
  'Open a group to chat.': ['Open a group to chat.', '打开群组即可聊天。'],
  'Open a group first.': ['Open a group first.', '请先打开群组。'],
  'Open a photo first.': ['Open a photo first.', '请先打开图片。'],
  'Open/sync contacts and resolve your draft before replacing the invitation.':
    [
      'Open/sync contacts and resolve your draft before replacing the invitation.',
      '请先打开并同步联系人，处理草稿后再更换邀请。',
    ],
  'Opening {0}… If the app does not open, tap Open {1}. Connect and sign, then return here to confirm the address.':
    [
      'Opening {0}… If the app does not open, tap Open {1}. Connect and sign, then return here to confirm the address.',
      '正在打开 {0}… 如果应用未打开，请点击“打开 {1}”。连接并签名后，返回此处确认地址。',
    ],
  'Opening conversation…': ['Opening conversation…', '正在打开对话…'],
  'Opening your account…': ['Opening your account…', '正在打开账户…'],
  'chat.encrypted-on-device': ['Encrypted on this device', '已在此设备上加密'],
  'conversation.mute': ['Mute alerts…', '静音提醒…'],
  'ranking.title': ['Communities', '社区'],
  'ranking.trending': ['Trending', '热门'],
  'ranking.largest': ['Largest', '最大'],
  'ranking.new': ['New', '最新'],
  'ranking.following': ['Following', '已关注'],
  'ranking.community': ['Community', '社区'],
  'ranking.window': ['Last 24 h', '最近 24 小时'],
  'ranking.full': ['See full ranking', '查看完整排行'],
  'ranking.collapse': ['Collapse ranking', '收起排行'],
  'ranking.expand': ['Expand ranking', '展开排行'],
  'ranking.followers {0}': ['{0} followers', '{0} 位关注者'],
  'ranking.growth-up {0}': ['▲ {0}%', '▲ {0}%'],
  'ranking.growth-down {0}': ['▼ {0}%', '▼ {0}%'],
  'ranking.growth-flat {0}': ['{0}%', '{0}%'],
  'ranking.relevance-growth-title': [
    'Relevance compared with the previous period of the same length',
    '相关度与上一个同等时长时段相比',
  ],
  'ranking.growth-title': [
    'Active members compared with the previous period of the same length',
    '活跃成员与上一个同等时长时段相比',
  ],
  'ranking.active-label': ['active', '活跃'],
  'feed.refresh': ['Refresh', '刷新'],
  'feed.refresh-label': [
    'Back to the top and load new posts',
    '回到顶部并加载新帖子',
  ],
  'feed.posted': ['posted', '发布了'],
  'feed.posted-label': [
    'New posts: back to the top and load them',
    '有新帖子：回到顶部并加载',
  ],
  'profile.bell-on {0}': ['Notifications on for @{0}', '已开启 @{0} 的通知'],
  'profile.bell-off {0}': ['Notifications off for @{0}', '已关闭 @{0} 的通知'],
  'upload.sending {0}': ['Sending: {0}%', '正在发送：{0}%'],
  'upload.percent {0}': ['{0}%', '{0}%'],
  'upload.processing': ['Processing…', '处理中…'],
  'upload.sending-file': ['Sending file…', '正在发送文件…'],
  'attachment.card-detail {0}': [
    '{0} MB · original, may keep GPS/EXIF',
    '{0} MB · 原始文件，可能保留 GPS/EXIF',
  ],
  'message.sending': ['Sending…', '正在发送…'],
  'crop.title': ['Edit media', '编辑图片'],
  'crop.stage': [
    'Drag to move the picture; use + and - to zoom',
    '拖动以移动图片；使用 + 和 - 缩放',
  ],
  'crop.zoom': ['Zoom', '缩放'],
  'crop.zoom-in': ['Zoom in', '放大'],
  'crop.zoom-out': ['Zoom out', '缩小'],
  'crop.apply': ['Apply', '应用'],
  'crop.cancel': ['Cancel', '取消'],
  'crop.failed': [
    'Could not frame the picture. Try another one.',
    '无法裁剪图片。请换一张试试。',
  ],
  'ranking.empty': ['No communities here yet.', '这里还没有社区。'],
  'ranking.sign-in': [
    'Sign in to see the communities you follow.',
    '登录后即可查看你关注的社区。',
  ],
  'ranking.unavailable': [
    'Ranking unavailable right now. Trying again…',
    '排行暂时不可用，正在重试…',
  ],
  'right-column.label': ['Conversation or rankings', '对话或排行榜'],
  'right-column.chat': ['Chat', '聊天'],
  'right-column.communities': ['Communities', '社区'],
  'right-column.users': ['Users', '用户'],
  'chat.attach-up-to-3mb': [
    'Attach photo or file · up to 3 MB',
    '附加图片或文件 · 最大 3 MB',
  ],
  'chat.attach-up-to-10mb': [
    'Attach photo or file · up to 10 MB',
    '附加图片或文件 · 最大 10 MB',
  ],
  'video.fullscreen': ['Full screen', '全屏'],
  'conversation.mute-1h': ['Mute for 1 hour', '静音 1 小时'],
  'conversation.mute-8h': ['Mute for 8 hours', '静音 8 小时'],
  'conversation.mute-24h': ['Mute for 24 hours', '静音 24 小时'],
  'conversation.mute-7d': ['Mute for 7 days', '静音 7 天'],
  'conversation.mute-forever': [
    'Mute until I turn alerts back on',
    '静音直到我重新开启',
  ],
  'conversation.resume-alerts': ['Resume alerts', '恢复提醒'],
  'conversation.alerts-saved': ['Alert setting saved.', '提醒设置已保存。'],
  'settings.appearance-language': ['Appearance and language', '外观与语言'],
  'settings.appearance-language.detail': [
    'Navy, Black or White theme and the app language',
    '藏蓝、黑色或白色主题，以及应用语言',
  ],
  'representatives.new-organization': ['New organization', '新建组织'],
  'community.create-menu': ['Create', '创建'],
  'community.create.images': ['Community banner and photo', '社区横幅和头像'],
  'community.create.add-banner': ['Add banner', '添加横幅'],
  'community.create.add-photo': ['Add photo', '添加头像'],
  'community.create.images-hint': [
    'Optional. The banner and photo are reviewed by the app once the community is created.',
    '可选。社区创建后，横幅和头像会经过应用审核。',
  ],
  'community.create.images-failed': [
    'The community was created, but the images were not saved. Fix them and press Create community again.',
    '社区已创建，但图片未保存。请修改后再次点击“创建社区”。',
  ],
  'dm.support-never-asks-seed': [
    'Support never asks for your seed phrase',
    '官方支持绝不会索要你的助记词',
  ],
  Open: ['Open', '打开'],
  'Open the discussion': ['Open the discussion', '打开讨论'],
  'Open community': ['Open community', '打开社区'],
  'Open account': ['Open account', '打开账户'],
  'Open contact': ['Open contact', '打开联系人'],
  'Open conversation': ['Open conversation', '打开对话'],
  'Open discussion': ['Open discussion', '打开讨论'],
  'Open photo': ['Open photo', '打开图片'],
  'Open my public profile': ['Open my public profile', '打开我的公开个人资料'],
  'Open in app': ['Open in app', '在应用中打开'],
  'Open profile': ['Open profile', '打开个人资料'],
  "Open @{0}'s profile": ["Open @{0}'s profile", '打开 @{0} 的个人资料'],
  'Open Phantom': ['Open Phantom', '打开 Phantom'],
  'Open post and {0} direct replies': [
    'Open post and {0} direct replies',
    '打开帖子及 {0} 条直接回复',
  ],
  'Open reply and its thread': [
    'Open reply and its thread',
    '打开回复及其讨论串',
  ],
  'Open video on YouTube': ['Open video on YouTube', '在 YouTube 上打开视频'],
  'Action unavailable.': ['Action unavailable.', '操作不可用。'],
  'Aceita · entrega por aparelho pendente': [
    'Accepted · device delivery pending',
    '已接受 · 等待送达设备',
  ],
  'Accepted by the server; recipient receipt is not yet confirmed': [
    'Accepted by the server; recipient receipt is not yet confirmed',
    '服务器已接受；尚未确认接收者收悉',
  ],
  Accept: ['Accept', '接受'],
  'Accept ownership': ['Accept ownership', '接受所有权'],
  'Accept representation and sign': [
    'Accept representation and sign',
    '接受代表授权并签名',
  ],
  'Acceptance not completed: {0}': [
    'Acceptance not completed: {0}',
    '接受未完成：{0}',
  ],
  'Acceptance saved. You can present this authorization in conversations.': [
    'Acceptance saved. You can present this authorization in conversations.',
    '接受记录已保存。你可以在对话中出示此授权。',
  ],
  'Access missing. Reopen the private address provided.': [
    'Access missing. Reopen the private address provided.',
    '缺少访问权限。请重新打开提供的私密地址。',
  ],
  'Invalid access. Reopen the private address provided.': [
    'Invalid access. Reopen the private address provided.',
    '访问无效。请重新打开提供的私密地址。',
  ],
  'Community access': ['Community access', '社区访问'],
  Add: ['Add', '添加'],
  'Add to favorites': ['Add to favorites', '添加到收藏'],
  'Add contact': ['Add contact', '添加联系人'],
  'Add to contacts': ['Add to contacts', '添加到联系人'],
  'Add {0} to contacts': ['Add {0} to contacts', '将 {0} 添加到联系人'],
  'Could not check this member. Try again.': [
    'Could not check this member. Try again.',
    '无法查询该成员，请重试。',
  ],
  'This member accepts conversation requests by invitation only. Ask them for an invitation link.':
    [
      'This member accepts conversation requests by invitation only. Ask them for an invitation link.',
      '该成员只接受通过邀请发起的聊天请求。请向对方索取邀请链接。',
    ],
  'My contacts': ['My contacts', '我的联系人'],
  'Add participants': ['Add participants', '添加成员'],
  'Add a contact or join a group to get started.': [
    'Add a contact or join a group to get started.',
    '添加联系人或加入群组即可开始。',
  ],
  Administrator: ['Administrator', '管理员'],
  'Manage {0}': ['Manage {0}', '管理 {0}'],
  'Warning recorded: your video was removed from public view for inappropriate content.':
    [
      'Warning recorded: your video was removed from public view for inappropriate content.',
      '已记录警告：你的视频因不当内容被从公开区域移除。',
    ],
  Contacts: ['Contacts', '联系人'],
  'Awaiting acceptance': ['Awaiting acceptance', '等待接受'],
  'Awaiting analysis': ['Awaiting analysis', '等待分析'],
  'Awaiting analysis. The file remains restricted.': [
    'Awaiting analysis. The file remains restricted.',
    '等待分析。文件仍受限制。',
  ],
  'Waiting for a wallet signature. Return to the browser that opened the request.':
    [
      'Waiting for a wallet signature. Return to the browser that opened the request.',
      '等待钱包签名。请返回打开请求的浏览器。',
    ],
  'Waiting for automatic authorization. Keep the device that generated the code open.':
    [
      'Waiting for automatic authorization. Keep the device that generated the code open.',
      '等待自动授权。请保持生成代码的设备处于打开状态。',
    ],
  'Wait for the profile to open before saving the full backup.': [
    'Wait for the profile to open before saving the full backup.',
    '请等待个人资料打开后，再保存完整备份。',
  ],
  'Wait for the current update.': [
    'Wait for the current update.',
    '请等待当前更新完成。',
  ],
  'Wait for conversations to update, then try again.': [
    'Wait for conversations to update, then try again.',
    '请等待对话更新后重试。',
  ],
  'Wait for the call identity to be confirmed.': [
    'Wait for the call identity to be confirmed.',
    '请等待通话身份确认。',
  ],
  'Wait for the current sign-in to finish, then try again.': [
    'Wait for the current sign-in to finish, then try again.',
    '请等待当前登录完成后重试。',
  ],
  'Wait for the offline app installation to finish, then try again.': [
    'Wait for the offline app installation to finish, then try again.',
    '请等待离线应用安装完成后重试。',
  ],
  'Please wait…': ['Please wait…', '请稍候…'],
  'No replies yet.': ['No replies yet.', '暂无回复。'],
  'Not verified yet.': ['Not verified yet.', '尚未验证。'],
  'Alerts were muted, but archiving was not saved. Try again.': [
    'Alerts were muted, but archiving was not saved. Try again.',
    '通知已静音，但归档未保存。请重试。',
  ],
  'Some sends are still pending. They will resume automatically.': [
    'Some sends are still pending. They will resume automatically.',
    '部分发送仍待完成，将自动恢复。',
  ],
  'Change differs from the original message.': [
    'Change differs from the original message.',
    '更改与原始消息不一致。',
  ],
  'Historical change does not match.': [
    'Historical change does not match.',
    '历史更改不匹配。',
  ],
  'Change saved.': ['Change saved.', '更改已保存。'],
  'Changes confirmed.': ['Changes confirmed.', '更改已确认。'],
  'Local changes are partially loaded; keep opening the local copy.': [
    'Local changes are partially loaded; keep opening the local copy.',
    '本地更改已部分加载；请继续打开本地副本。',
  ],
  'Change profile photo': ['Change profile photo', '更换个人资料图片'],
  'Change group photo': ['Change group photo', '更换群组图片'],
  'Invalid audio sample.': ['Invalid audio sample.', '音频采样无效。'],
  'Zoom in on image': ['Zoom in on image', '放大图片'],
  'Zoom in on image {0}': ['Zoom in on image {0}', '放大图片 {0}'],
  'Analyzing and saving this case in the temporary round…': [
    'Analyzing and saving this case in the temporary round…',
    '正在分析此案例并保存到临时评估轮次…',
  ],
  'Analysis completed: content allowed.': [
    'Analysis completed: content allowed.',
    '分析已完成：内容获准。',
  ],
  'Content analysis': ['Content analysis', '内容分析'],
  'Analysis in progress. The file remains restricted.': [
    'Analysis in progress. The file remains restricted.',
    '正在分析。文件仍受限制。',
  ],
  'Analysis ended due to replacement, removal or a rule update.': [
    'Analysis ended due to replacement, removal or a rule update.',
    '分析因替换、移除或规则更新而结束。',
  ],
  'Analysis uncertain. The file remains restricted and can be appealed.': [
    'Analysis uncertain. The file remains restricted and can be appealed.',
    '分析结果不确定。文件仍受限制，可提出申诉。',
  ],
  'Analysis unavailable.': ['Analysis unavailable.', '分析不可用。'],
  'Analysis: {0}': ['Analysis: {0}', '分析：{0}'],
  'Attach photos, GIFs or video': [
    'Attach photos, GIFs or video',
    '附加图片、GIF 或视频',
  ],
  'This attachment has not been downloaded on this device. Connect and tap to download.':
    [
      'This attachment has not been downloaded on this device. Connect and tap to download.',
      '此设备尚未下载附件。请联网并点击下载。',
    ],
  'Group attachment does not match.': [
    'Group attachment does not match.',
    '群组附件不匹配。',
  ],
  'Attachment incomplete or tampered with.': [
    'Attachment incomplete or tampered with.',
    '附件不完整或遭到篡改。',
  ],
  'Attachments differ from the authenticated message.': [
    'Attachments differ from the authenticated message.',
    '附件与已验证的消息不一致。',
  ],
  'Processing attachments. Please wait.': [
    'Processing attachments. Please wait.',
    '正在处理附件。请稍候。',
  ],
  'Animals and nature': ['Animals and nature', '动物与自然'],
  'Annotation does not match the case.': [
    'Annotation does not match the case.',
    '标注与案例不匹配。',
  ],
  Previous: ['Previous', '上一页'],
  'By accepting, you take ownership and management of this community. Check its rules and current owner.':
    [
      'By accepting, you take ownership and management of this community. Check its rules and current owner.',
      '接受后，你将获得此社区的所有权与管理权。请先核对规则和当前所有者。',
    ],
  'When searching for or loading GIFs, your device connects to KLIPY, which receives your IP and may collect your searches, accessed GIFs and browser data. The app does not send your wallet, keys or conversation history to KLIPY.':
    [
      'When searching for or loading GIFs, your device connects to KLIPY, which receives your IP and may collect your searches, accessed GIFs and browser data. The app does not send your wallet, keys or conversation history to KLIPY.',
      '搜索或加载 GIF 时，设备会连接到 KLIPY。该服务会接收你的 IP，并可能收集搜索内容、访问的 GIF 及浏览器数据。应用不会向 KLIPY 发送钱包信息、密钥或对话历史。',
    ],
  'Delete send': ['Delete send', '删除发送项'],
  'Delete for both': ['Delete for both', '为双方删除'],
  'Delete all images and results from this temporary round? Files already downloaded remain on your device.':
    [
      'Delete all images and results from this temporary round? Files already downloaded remain on your device.',
      '删除本次临时评估的所有图片和结果？已下载的文件仍会保留在设备上。',
    ],
  'DM device': ['DM device', '私信设备'],
  "The contact's device is not authorized.": [
    "The contact's device is not authorized.",
    '联系人的设备未获授权。',
  ],
  "The contact's device was revoked.": [
    "The contact's device was revoked.",
    '联系人的设备授权已撤销。',
  ],
  'Recovered device': ['Recovered device', '已恢复的设备'],
  'Device revoked or key not authorized.': [
    'Device revoked or key not authorized.',
    '设备授权已撤销或密钥未获授权。',
  ],
  'Device revoked.': ['Device revoked.', '设备授权已撤销。'],
  'Device linked. Your account is ready.': [
    'Device linked. Your account is ready.',
    '设备已关联。账户已就绪。',
  ],
  'Invalid call devices.': ['Invalid call devices.', '通话设备无效。'],
  'Invalid DM devices.': ['Invalid DM devices.', '私信设备无效。'],
  "The contact's devices changed.": [
    "The contact's devices changed.",
    '联系人的设备已更改。',
  ],
  'Devices changed while reading. Try again.': [
    'Devices changed while reading. Try again.',
    '读取期间设备已更改。请重试。',
  ],
  Appearance: ['Appearance', '外观'],
  'Apply sanction': ['Apply sanction', '施加处罚'],
  'Present authorization': ['Present authorization', '出示授权'],
  'Present an accepted authorization or send a representation invitation.': [
    'Present an accepted authorization or send a representation invitation.',
    '出示已接受的授权，或发送代表邀请。',
  ],
  'Device storage unavailable. No local authorization was confirmed.': [
    'Device storage unavailable. No local authorization was confirmed.',
    '设备存储不可用。未确认任何本地授权。',
  ],
  'Storage unavailable or package invalid. Use a clean test browser profile.': [
    'Storage unavailable or package invalid. Use a clean test browser profile.',
    '存储不可用或数据包无效。请使用全新的测试浏览器配置。',
  ],
  'Local storage unavailable.': [
    'Local storage unavailable.',
    '本地存储不可用。',
  ],
  Archived: ['Archived', '已归档'],
  Archive: ['Archive', '归档'],
  'Archive community': ['Archive community', '归档社区'],
  'Archiving mutes alerts. Unarchiving does not automatically restore alerts.':
    [
      'Archiving mutes alerts. Unarchiving does not automatically restore alerts.',
      '归档会静音通知。取消归档不会自动恢复通知。',
    ],
  'File still being prepared.': [
    'File still being prepared.',
    '文件仍在准备中。',
  ],
  'Unsupported backup file.': [
    'Unsupported backup file.',
    '不支持此备份文件。',
  ],
  'The file must be no larger than 3 MB.': [
    'The file must be no larger than 3 MB.',
    '文件大小不得超过 3 MB。',
  ],
  'The file must be no larger than 10 MB.': [
    'The file must be no larger than 10 MB.',
    '文件大小不得超过 10 MB。',
  ],
  'Profile or community file identified by the record below.': [
    'Profile or community file identified by the record below.',
    '下方记录所标识的个人资料或社区文件。',
  ],
  'File exceeds {0} MB.': ['File exceeds {0} MB.', '文件超过 {0} MB。'],
  'Imported file: {0}': ['Imported file: {0}', '已导入文件：{0}'],
  'File imported. The active package is now {0}. Select the source account and click Test this package.':
    [
      'File imported. The active package is now {0}. Select the source account and click Test this package.',
      '文件已导入。当前数据包为 {0}。请选择来源账户，然后点击“测试此数据包”。',
    ],
  'File intact and complete. History imported into Conversations on this device.':
    [
      'File intact and complete. History imported into Conversations on this device.',
      '文件完整且无损。历史已导入此设备的“对话”。',
    ],
  'File intact, with incomplete content. Available items were imported; reset remains blocked.':
    [
      'File intact, with incomplete content. Available items were imported; reset remains blocked.',
      '文件无损，但内容不完整。已有项目已导入；重置仍被阻止。',
    ],
  'Invalid file.': ['Invalid file.', '文件无效。'],
  'File not completed.': ['File not completed.', '文件未完成。'],
  'Recoverable file missing.': [
    'Recoverable file missing.',
    '缺少可恢复文件。',
  ],
  'File removed from the queue; no annotation was saved for it.': [
    'File removed from the queue; no annotation was saved for it.',
    '文件已从队列中移除；未保存其标注。',
  ],
  'File empty or larger than 3 MB. Choose another file.': [
    'File empty or larger than 3 MB. Choose another file.',
    '文件为空或超过 3 MB。请选择其他文件。',
  ],
  'File empty or larger than 10 MB. Choose another file.': [
    'File empty or larger than 10 MB. Choose another file.',
    '文件为空或超过 10 MB。请选择其他文件。',
  ],
  'File: {0}': ['File: {0}', '文件：{0}'],
  'Files differ for the same historical record.': [
    'Files differ for the same historical record.',
    '同一历史记录的文件不一致。',
  ],
  "Changes remain a preview on this device until confirmed. Confirmed images go through the app's analysis.":
    [
      "Changes remain a preview on this device until confirmed. Confirmed images go through the app's analysis.",
      '确认前，更改仅作为此设备上的预览。确认后的图片会经过应用分析。',
    ],
  'Both signatures are valid but different. This attempt cannot provide stable recovery.':
    [
      'Both signatures are valid but different. This attempt cannot provide stable recovery.',
      '两次签名均有效，但不一致。本次尝试无法提供稳定恢复。',
    ],
  'Sign authorization': ['Sign authorization', '签署授权'],
  'Signature confirmed. Close {0} and return to the browser where you started signing in to confirm the address.':
    [
      'Signature confirmed. Close {0} and return to the browser where you started signing in to confirm the address.',
      '签名已确认。请关闭 {0}，返回发起登录的浏览器以确认地址。',
    ],
  'Invalid recovery signature.': [
    'Invalid recovery signature.',
    '恢复签名无效。',
  ],
  'Recovery signature rejected: invalid wallet, message or integrity.': [
    'Recovery signature rejected: invalid wallet, message or integrity.',
    '恢复签名被拒绝：钱包、消息或完整性无效。',
  ],
  'Test signature confirmed. Phantom returned the response to this browser. No 0xDMme account was connected. If this is another tab, return to the original tab to compare the result.':
    [
      'Test signature confirmed. Phantom returned the response to this browser. No 0xDMme account was connected. If this is another tab, return to the original tab to compare the result.',
      '测试签名已确认。Phantom 已将响应返回此浏览器。未连接任何 0xDMme 账户。若这是另一个标签页，请返回原标签页比较结果。',
    ],
  'Invalid test signature.': ['Invalid test signature.', '测试签名无效。'],
  'Invalid EVM signature.': ['Invalid EVM signature.', 'EVM 签名无效。'],
  'Invalid signature.': ['Invalid signature.', '签名无效。'],
  'Signing was not completed in the wallet. Check the account and try again.': [
    'Signing was not completed in the wallet. Check the account and try again.',
    '钱包未完成签名。请检查账户后重试。',
  ],
  'Invalid Solana signature.': [
    'Invalid Solana signature.',
    'Solana 签名无效。',
  ],
  'Recovery signatures missing.': [
    'Recovery signatures missing.',
    '缺少恢复签名。',
  ],
  'Sign in your wallet and return to this browser. Completion is automatic.': [
    'Sign in your wallet and return to this browser. Completion is automatic.',
    '请在钱包中签名并返回此浏览器。流程会自动完成。',
  ],
  'Until {0}': ['Until {0}', '截至 {0}'],
  'Up to 4 photos, 3 GIFs or 1 video': [
    'Up to 4 photos, 3 GIFs or 1 video',
    '最多 4 张图片、3 个 GIF 或 1 个视频',
  ],
  Answer: ['Answer', '接听'],
  'Enable post and reply notifications': [
    'Enable post and reply notifications',
    '启用帖子与回复通知',
  ],
  'Enable incoming calls': ['Enable incoming calls', '启用来电'],
  'Enable sounds': ['Enable sounds', '启用声音'],
  Activity: ['Activity', '活动'],
  'Activity updated.': ['Activity updated.', '活动已更新。'],
  'Public profile activity': ['Public profile activity', '公开个人资料动态'],
  'Manually assigned, without management powers. Up to 20 badges and three per person.':
    [
      'Manually assigned, without management powers. Up to 20 badges and three per person.',
      '手动分配，不授予管理权限。最多 20 个徽章，每人最多 3 个。',
    ],
  'Assign badge': ['Assign badge', '分配徽章'],
  'Group update pending': ['Group update pending', '群组更新待完成'],
  'Update in progress. Keep the app open and connected.': [
    'Update in progress. Keep the app open and connected.',
    '正在更新。请保持应用打开并联网。',
  ],
  'Live updates available after authorizing the device.': [
    'Live updates available after authorizing the device.',
    '设备获授权后即可接收实时更新。',
  ],
  'Update not completed. Reopen the page when convenient.': [
    'Update not completed. Reopen the page when convenient.',
    '更新未完成。请在方便时重新打开页面。',
  ],
  'Offline update unavailable. The installed version remains available.': [
    'Offline update unavailable. The installed version remains available.',
    '离线更新不可用。已安装的版本仍可使用。',
  ],
  Updated: ['Updated', '已更新'],
  'Updating contacts…': ['Updating contacts…', '正在更新联系人…'],
  Refresh: ['Refresh', '刷新'],
  'Refresh the group before changing its photo.': [
    'Refresh the group before changing its photo.',
    '请刷新群组后再更换图片。',
  ],
  'Publication audience does not match.': [
    'Publication audience does not match.',
    '发布对象不匹配。',
  ],
  'Invalid audience.': ['Invalid audience.', '受众无效。'],
  'Audience or recovery incomplete.': [
    'Audience or recovery incomplete.',
    '受众或恢复信息不完整。',
  ],
  'Audio ended on this device. The server has not confirmed; the other side ends within 20 seconds.':
    [
      'Audio ended on this device. The server has not confirmed; the other side ends within 20 seconds.',
      '此设备上的音频已结束。服务器尚未确认；对方会在 20 秒内结束。',
    ],
  'Author unavailable': ['Author unavailable', '作者不可用'],
  'Recovery authority missing.': [
    'Recovery authority missing.',
    '缺少恢复授权信息。',
  ],
  'Group session authority missing.': [
    'Group session authority missing.',
    '缺少群组会话授权信息。',
  ],
  'Group authority incomplete.': [
    'Group authority incomplete.',
    '群组授权信息不完整。',
  ],
  'Authority belongs to another account or device.': [
    'Authority belongs to another account or device.',
    '授权属于另一个账户或设备。',
  ],
  'Contact authority has not been verified.': [
    'Contact authority has not been verified.',
    '联系人授权尚未核验。',
  ],
  'Historical DM authority missing.': [
    'Historical DM authority missing.',
    '缺少历史私信授权信息。',
  ],
  'Historical recovery authority missing.': [
    'Historical recovery authority missing.',
    '缺少历史恢复授权信息。',
  ],
  'Current authorization not confirmed: {0}': [
    'Current authorization not confirmed: {0}',
    '当前授权未确认：{0}',
  ],
  "Authorization created. Open the representative's conversation to send it.": [
    "Authorization created. Open the representative's conversation to send it.",
    '授权已创建。请打开与代表的对话以发送。',
  ],
  'Account authorization changed.': [
    'Account authorization changed.',
    '账户授权已更改。',
  ],
  'Authorization revoked.': ['Authorization revoked.', '授权已撤销。'],
  'Authorize a representative for {0}. The signature does not grant group roles or move funds.':
    [
      'Authorize a representative for {0}. The signature does not grant group roles or move funds.',
      '为 {0} 授权代表。签名不会授予群组职务或转移资金。',
    ],
  'Allow microphone access. Recording starts after permission is granted.': [
    'Allow microphone access. Recording starts after permission is granted.',
    '请允许使用麦克风。授权后开始录音。',
  ],
  'Authorize or recover this device to open the vault.': [
    'Authorize or recover this device to open the vault.',
    '请授权或恢复此设备以打开保险库。',
  ],
  'Update notice exceeds the limit.': [
    'Update notice exceeds the limit.',
    '更新通知超过限制。',
  ],
  'Update notice incomplete.': [
    'Update notice incomplete.',
    '更新通知不完整。',
  ],
  'Invalid update notice.': ['Invalid update notice.', '更新通知无效。'],
  'Invalid cleanup notice.': ['Invalid cleanup notice.', '清理通知无效。'],
  'Privacy notice unavailable.': [
    'Privacy notice unavailable.',
    '隐私提示不可用。',
  ],
  'Public content notice': ['Public content notice', '公开内容提示'],
  'Invalid analysis notices.': ['Invalid analysis notices.', '分析通知无效。'],
  'Alerts and GIFs enabled, presence hidden and read receipts enabled.': [
    'Alerts and GIFs enabled, presence hidden and read receipts enabled.',
    '启用通知、GIF 和已读回执，隐藏在线状态。',
  ],
  Blue: ['Blue', '蓝色'],
  'Backup belongs to another account or has an invalid header.': [
    'Backup belongs to another account or has an invalid header.',
    '备份属于另一个账户，或文件头无效。',
  ],
  'Backup ended.': ['Backup ended.', '备份已结束。'],
  'Backup exceeds the 4 GiB per-file limit.': [
    'Backup exceeds the 4 GiB per-file limit.',
    '备份超过每个文件 4 GiB 的上限。',
  ],
  'Backup closed.': ['Backup closed.', '备份已关闭。'],
  'Backup incomplete or reordered.': [
    'Backup incomplete or reordered.',
    '备份不完整或顺序被更改。',
  ],
  'Backup incomplete: {0} unavailable items. Reset remains blocked; try saving again.':
    [
      'Backup incomplete: {0} unavailable items. Reset remains blocked; try saving again.',
      '备份不完整：{0} 项不可用。重置仍被阻止；请重新尝试保存。',
    ],
  'Backup incomplete. Reset requires all conversations and media.': [
    'Backup incomplete. Reset requires all conversations and media.',
    '备份不完整。重置需要所有对话和媒体。',
  ],
  'Backup already ended.': ['Backup already ended.', '备份已结束。'],
  'Backup prepared. Keep the file and use “Validate file” to check the saved copy.':
    [
      'Backup prepared. Keep the file and use “Validate file” to check the saved copy.',
      '备份已准备好。请保留文件，并使用“验证文件”检查保存的副本。',
    ],
  'Backup truncated.': ['Backup truncated.', '备份被截断。'],
  'Backup empty or larger than 1 GiB.': [
    'Backup empty or larger than 1 GiB.',
    '备份为空或超过 1 GiB。',
  ],
  'Badge updated.': ['Badge updated.', '徽章已更新。'],
  'Custom badges': ['Custom badges', '自定义徽章'],
  'Download original file': ['Download original file', '下载原始文件'],
  Flags: ['Flags', '旗帜'],
  'Reversible ban': ['Reversible ban', '可撤销封禁'],
  'Community banner': ['Community banner', '社区横幅'],
  'Profile banner': ['Profile banner', '个人资料横幅'],
  'Block incomplete or corrupted.': [
    'Block incomplete or corrupted.',
    '数据块不完整或损坏。',
  ],
  Blocked: ['Blocked', '已屏蔽'],
  Block: ['Block', '屏蔽'],
  'Block contact': ['Block contact', '屏蔽联系人'],
  'Block user': ['Block user', '屏蔽用户'],
  'block {0}': ['block {0}', '拦截 {0}'],
  'Block removed. A new request and approval are still required.': [
    'Block removed. A new request and approval are still required.',
    '屏蔽已解除。仍需重新发送请求并获得批准。',
  ],
  White: ['White', '白色'],
  'Search completed in copies available on this device.': [
    'Search completed in copies available on this device.',
    '已搜索此设备上的可用副本。',
  ],
  'Search completed. Received messages are below.': [
    'Search completed. Received messages are below.',
    '搜索已完成。收到的消息列于下方。',
  ],
  'GIF search is currently unavailable.': [
    'GIF search is currently unavailable.',
    'GIF 搜索暂时不可用。',
  ],
  'GIF search unavailable. You can attach a GIF file.': [
    'GIF search unavailable. You can attach a GIF file.',
    'GIF 搜索不可用。你可以附加 GIF 文件。',
  ],
  'Search belongs to another account.': [
    'Search belongs to another account.',
    '搜索属于另一个账户。',
  ],
  'Invalid search.': ['Invalid search.', '搜索无效。'],
  'Searching on this device…': [
    'Searching on this device…',
    '正在此设备上搜索…',
  ],
  'Searching…': ['Searching…', '正在搜索…'],
  'Search posts for “{0}”': ['Search posts for “{0}”', '搜索包含“{0}”的帖子'],
  'Search results for “{0}”': ['Search results for “{0}”', '“{0}”的搜索结果'],
  'Invalid post search.': ['Invalid post search.', '帖子搜索内容无效。'],
  'Clear search': ['Clear search', '清除搜索'],
  'Search messages': ['Search messages', '搜索消息'],
  'Find profile': ['Find profile', '查找个人资料'],
  'Find and check the profile before continuing.': [
    'Find and check the profile before continuing.',
    '请查找并核对个人资料后继续。',
  ],
  'Enter between 1 and 128 characters.': [
    'Enter between 1 and 128 characters.',
    '请输入 1–128 个字符。',
  ],
  'Invalid header.': ['Invalid header.', '文件头无效。'],
  'Cache belongs to another group or record.': [
    'Cache belongs to another group or record.',
    '缓存属于另一个群组或记录。',
  ],
  'Cache occupied by pending sends. Complete or cancel them before downloading other attachments.':
    [
      'Cache occupied by pending sends. Complete or cancel them before downloading other attachments.',
      '待发送内容占用了缓存。请完成或取消发送后，再下载其他附件。',
    ],
  'Invalid DM key box.': ['Invalid DM key box.', '私信密钥容器无效。'],
  'Invalid Olm box.': ['Invalid Olm box.', 'Olm 容器无效。'],
  'Camera unavailable. Use HTTPS and allow camera access, or copy the code.': [
    'Camera unavailable. Use HTTPS and allow camera access, or copy the code.',
    '摄像头不可用。请使用 HTTPS 并允许摄像头权限，或复制代码。',
  ],
  'Selected path missing.': ['Selected path missing.', '缺少所选路径。'],
  'Invalid test fields.': ['Invalid test fields.', '测试字段无效。'],
  'Channel unavailable.': ['Channel unavailable.', '通道不可用。'],
  'Invalid channel.': ['Invalid channel.', '通道无效。'],
  Cancel: ['Cancel', '取消'],
  'Cancel call': ['Cancel call', '取消通话'],
  'Cancel request': ['Cancel request', '取消请求'],
  'Cancel transfer': ['Cancel transfer', '取消转让'],
  'Publication capsules do not match.': [
    'Publication capsules do not match.',
    '发布密钥封装不匹配。',
  ],
  'Loading activity…': ['Loading activity…', '正在加载活动…'],
  'Loading GIFs…': ['Loading GIFs…', '正在加载 GIF…'],
  'Loading image…': ['Loading image…', '正在加载图片…'],
  'Loading handle messages…': [
    'Loading handle messages…',
    '正在加载用户名私信…',
  ],
  'Loading options…': ['Loading options…', '正在加载选项…'],
  'Loading public profile…': [
    'Loading public profile…',
    '正在加载公开个人资料…',
  ],
  'Loading followers…': ['Loading followers…', '正在加载关注者…'],
  'Loading your analysis…': ['Loading your analysis…', '正在加载你的分析结果…'],
  'Loading video…': ['Loading video…', '正在加载视频…'],
  'Load badges': ['Load badges', '加载徽章'],
  'Load received reports': ['Load received reports', '加载收到的举报'],
  'Load image': ['Load image', '加载图片'],
  'Load my reports': ['Load my reports', '加载我的举报'],
  'Load sanctions': ['Load sanctions', '加载处罚'],
  'Load this version first.': ['Load this version first.', '请先加载此版本。'],
  'Invalid authorization card.': [
    'Invalid authorization card.',
    '授权卡片无效。',
  ],
  'Invalid profile card.': ['Invalid profile card.', '个人资料卡片无效。'],
  'Local profile card does not match.': [
    'Local profile card does not match.',
    '本地个人资料卡片不匹配。',
  ],
  'Card sent through encrypted chat.': [
    'Card sent through encrypted chat.',
    '卡片已通过加密聊天发送。',
  ],
  'Case {0}': ['Case {0}', '案例 {0}'],
  'Case {0} saved with image, scores and your reference.': [
    'Case {0} saved with image, scores and your reference.',
    '案例 {0} 已保存，包含图片、评分和你的参考标注。',
  ],
  'Invalid case received from collection.': [
    'Invalid case received from collection.',
    '从采集端收到的案例无效。',
  ],
  'Local catalog belongs to another account.': [
    'Local catalog belongs to another account.',
    '本地目录属于另一个账户。',
  ],
  'Settings categories': ['Settings categories', '设置类别'],
  'Call cancelled.': ['Call cancelled.', '通话已取消。'],
  'Call connected · encrypted voice.': [
    'Call connected · encrypted voice.',
    '通话已连接 · 加密语音。',
  ],
  'Voice call': ['Voice call', '语音通话'],
  'Voice call · {0}': ['Voice call · {0}', '语音通话 · {0}'],
  'Missed voice call · {0}': ['Missed voice call · {0}', '未接语音通话 · {0}'],
  'Incoming voice call.': ['Incoming voice call.', '收到语音来电。'],
  'Incoming voice call. Open the app to answer.': [
    'Incoming voice call. Open the app to answer.',
    '收到语音来电。请打开应用接听。',
  ],
  'Call ended when leaving this page.': [
    'Call ended when leaving this page.',
    '离开此页面后通话已结束。',
  ],
  'Call ended or unavailable.': [
    'Call ended or unavailable.',
    '通话已结束或不可用。',
  ],
  'Call ended: authorization unavailable.': [
    'Call ended: authorization unavailable.',
    '通话已结束：授权不可用。',
  ],
  'Call ended: authorization changed.': [
    'Call ended: authorization changed.',
    '通话已结束：授权已更改。',
  ],
  'Call ended: connection to server lost.': [
    'Call ended: connection to server lost.',
    '通话已结束：与服务器的连接中断。',
  ],
  'Call ended.': ['Call ended.', '通话已结束。'],
  'Call declined.': ['Call declined.', '通话已拒绝。'],
  'Call rejected: invalid identity or negotiation.': [
    'Call rejected: invalid identity or negotiation.',
    '通话被拒绝：身份或协商无效。',
  ],
  "Calls are awaiting configuration of the app's own TURN server.": [
    "Calls are awaiting configuration of the app's own TURN server.",
    '通话功能等待应用自有 TURN 服务器完成配置。',
  ],
  'Calls available while the app is open.': [
    'Calls available while the app is open.',
    '应用打开时可进行通话。',
  ],
  'Calls currently unavailable.': [
    'Calls currently unavailable.',
    '通话暂时不可用。',
  ],
  'Missed calls removed from the list on all devices.': [
    'Missed calls removed from the list on all devices.',
    '已从所有设备的列表中移除未接来电。',
  ],
  'Calls: sign in and authorize this device.': [
    'Calls: sign in and authorize this device.',
    '通话：请登录并授权此设备。',
  ],
  'Calling…': ['Calling…', '正在呼叫…'],
  'Key confirmed. Ready to send and receive.': [
    'Key confirmed. Ready to send and receive.',
    '密钥已确认。可以发送和接收。',
  ],
  'Key belongs to a revoked device.': [
    'Key belongs to a revoked device.',
    '密钥属于已撤销授权的设备。',
  ],
  'Invalid storage key.': ['Invalid storage key.', '存储密钥无效。'],
  'Invalid backup key.': ['Invalid backup key.', '备份密钥无效。'],
  'Encryption key missing.': ['Encryption key missing.', '缺少加密密钥。'],
  'Destination key or recovery request changed.': [
    'Destination key or recovery request changed.',
    '目标密钥或恢复请求已更改。',
  ],
  'Group source key does not match.': [
    'Group source key does not match.',
    '群组来源密钥不匹配。',
  ],
  'Status source key does not match.': [
    'Status source key does not match.',
    '状态来源密钥不匹配。',
  ],
  'Source key not authorized.': [
    'Source key not authorized.',
    '来源密钥未获授权。',
  ],
  'The recovery key must contain 256 random bits.': [
    'The recovery key must contain 256 random bits.',
    '恢复密钥必须包含 256 位随机比特。',
  ],
  'Invalid recovery key.': ['Invalid recovery key.', '恢复密钥无效。'],
  'Duplicate key.': ['Duplicate key.', '密钥重复。'],
  'Incompatible local key.': ['Incompatible local key.', '本地密钥不兼容。'],
  'Recovered key does not match.': [
    'Recovered key does not match.',
    '恢复的密钥不匹配。',
  ],
  'Invalid Solana key.': ['Invalid Solana key.', 'Solana 密钥无效。'],
  'Source keys do not match.': [
    'Source keys do not match.',
    '来源密钥不匹配。',
  ],
  'Invalid local keys.': ['Invalid local keys.', '本地密钥无效。'],
  'Old checkpoint.': ['Old checkpoint.', '旧检查点。'],
  'Invalid checkpoint.': ['Invalid checkpoint.', '检查点无效。'],
  'Local checkpoint corrupted.': [
    'Local checkpoint corrupted.',
    '本地检查点损坏。',
  ],
  'Invalid local checkpoint.': [
    'Invalid local checkpoint.',
    '本地检查点无效。',
  ],
  'Checkpoint changed during migration.': [
    'Checkpoint changed during migration.',
    '迁移期间检查点已更改。',
  ],
  'Invalid group delivery checks.': [
    'Invalid group delivery checks.',
    '群组送达状态无效。',
  ],
  'Sort communities': ['Sort communities', '排序社区'],
  'Client {0}': ['Client {0}', '客户端 {0}'],
  'Client unavailable.': ['Client unavailable.', '客户端不可用。'],
  'Client started. Copy the public key from the other screen to authorize.': [
    'Client started. Copy the public key from the other screen to authorize.',
    '客户端已启动。请复制另一个页面的公钥以授权。',
  ],
  'Invalid client.': ['Invalid client.', '客户端无效。'],
  'Invalid test encoding.': ['Invalid test encoding.', '测试编码无效。'],
  'Unsupported record encoding.': [
    'Unsupported record encoding.',
    '不支持此记录编码。',
  ],
  'Confirmation code does not match. Check it on the authorizing device.': [
    'Confirmation code does not match. Check it on the authorizing device.',
    '确认码不匹配。请在授权设备上核对。',
  ],
  "Code differs from the account's known identity.": [
    "Code differs from the account's known identity.",
    '代码与账户的已知身份不一致。',
  ],
  'Source code and licenses': ['Source code and licenses', '源代码与许可证'],
  'Code exceeds the limit.': ['Code exceeds the limit.', '代码超过限制。'],
  'Code expired.': ['Code expired.', '代码已过期。'],
  'Code expired. Generate a new linking code.': [
    'Code expired. Generate a new linking code.',
    '代码已过期。请生成新的关联码。',
  ],
  'Invalid code. Copy a valid code or link from the connected device.': [
    'Invalid code. Copy a valid code or link from the connected device.',
    '代码无效。请从已连接设备复制有效代码或链接。',
  ],
  'Code not found. Check the record and wait for DNS propagation.': [
    'Code not found. Check the record and wait for DNS propagation.',
    '未找到代码。请检查记录并等待 DNS 生效。',
  ],
  Vault: ['Vault', '保险库'],
  'Vault encrypted locally in {0} ms. Only the envelope may be stored on the relay.':
    [
      'Vault encrypted locally in {0} ms. Only the envelope may be stored on the relay.',
      '保险库已在本地加密，耗时 {0} 毫秒。中继仅可保存加密封装。',
    ],
  'Vault and backup': ['Vault and backup', '保险库与备份'],
  'Vault belongs to another identity.': [
    'Vault belongs to another identity.',
    '保险库属于另一个身份。',
  ],
  'Vault rejected by the relay.': [
    'Vault rejected by the relay.',
    '中继拒绝了保险库。',
  ],
  'Vault rejected: invalid secret or integrity.': [
    'Vault rejected: invalid secret or integrity.',
    '保险库被拒绝：密钥或完整性无效。',
  ],
  'Remote vault differs from checkpoint.': [
    'Remote vault differs from checkpoint.',
    '远程保险库与检查点不一致。',
  ],
  'Vault reset: {0} MB freed. Imported history remains on this device.': [
    'Vault reset: {0} MB freed. Imported history remains on this device.',
    '保险库已重置：释放了 {0} MB。导入的历史仍保留在此设备上。',
  ],
  'Collection unavailable.': ['Collection unavailable.', '采集不可用。'],
  'When signed in, this choice follows your account and can be changed in Profile.':
    [
      'When signed in, this choice follows your account and can be changed in Profile.',
      '登录后，此选项随账户同步，可在“个人资料”中更改。',
    ],
  'Start the conversation in this community.': [
    'Start the conversation in this community.',
    '在此社区开始对话。',
  ],
  comments: ['comments', '评论'],
  'Food and drink': ['Food and drink', '食物与饮料'],
  Shared: ['Shared', '已分享'],
  Share: ['Share', '分享'],
  'Share on my profile': ['Share on my profile', '分享到我的个人资料'],
  'Share with a community.': ['Share with a community.', '分享到社区。'],
  'community.shared-activity': ['Shared', '分享了'],
  'Invalid length.': ['Invalid length.', '长度无效。'],
  'Receipt does not match.': ['Receipt does not match.', '凭据不匹配。'],
  'Duplicate receipt.': ['Duplicate receipt.', '凭据重复。'],
  'Cleanup receipts incomplete. Check the state before continuing.': [
    'Cleanup receipts incomplete. Check the state before continuing.',
    '清理凭据不完整。请确认状态后继续。',
  ],
  Community: ['Community', '社区'],
  'Community {0}': ['Community {0}', '社区 {0}'],
  'Archived community': ['Archived community', '已归档社区'],
  'Community unavailable.': ['Community unavailable.', '社区不可用。'],
  Communities: ['Communities', '社区'],
  'Communities · Open access': ['Communities · Open access', '社区 · 公开阅读'],
  'Communities or handle messages': [
    'Communities or handle messages',
    '社区或用户名私信',
  ],
  'New communities': ['New communities', '新建社区'],
  'Communities are public and free. Any authorized public profile can participate without following.':
    [
      'Communities are public and free. Any authorized public profile can participate without following.',
      '社区公开且免费。任何获授权的公开个人资料都可参与，无需关注。',
    ],
  'Followed communities': ['Followed communities', '已关注社区'],
  'Finish the operation or save your changes before updating.': [
    'Finish the operation or save your changes before updating.',
    '请完成操作或保存更改后再更新。',
  ],
  'Finish syncing before saving privacy settings.': [
    'Finish syncing before saving privacy settings.',
    '请完成同步后再保存隐私设置。',
  ],
  'Finish linking or close the camera in Profile → Devices before updating.': [
    'Finish linking or close the camera in Profile → Devices before updating.',
    '请完成关联，或在“个人资料 → 设备”中关闭摄像头后再更新。',
  ],
  'Complete or cancel {0} before updating.': [
    'Complete or cancel {0} before updating.',
    '请完成或取消{0}后再更新。',
  ],
  'Complete or cancel the previous recovery request.': [
    'Complete or cancel the previous recovery request.',
    '请完成或取消先前的恢复请求。',
  ],
  Done: ['Done', '已完成'],
  'Complete issuance': ['Complete issuance', '完成签发'],
  'Complete organization registration': [
    'Complete organization registration',
    '完成组织注册',
  ],
  'Successfully connected': ['Successfully connected', '连接成功'],
  'Connected: sync before opening history.': [
    'Connected: sync before opening history.',
    '已连接：请先同步，再打开历史记录。',
  ],
  'Connecting live updates…': ['Connecting live updates…', '正在连接实时更新…'],
  'Connecting…': ['Connecting…', '正在连接…'],
  'Connect the original wallet or open an authorized local copy.': [
    'Connect the original wallet or open an authorized local copy.',
    '请连接原钱包，或打开已获授权的本地副本。',
  ],
  'Connect the original wallet first.': [
    'Connect the original wallet first.',
    '请先连接原钱包。',
  ],
  'Connect and authorize this device to select remote content.': [
    'Connect and authorize this device to select remote content.',
    '请连接并授权此设备以选择远程内容。',
  ],
  'Connect and authorize the device to sync.': [
    'Connect and authorize the device to sync.',
    '请连接并授权此设备以同步。',
  ],
  'Connect and authorize your device to manage your public profile.': [
    'Connect and authorize your device to manage your public profile.',
    '请连接并授权设备以管理公开个人资料。',
  ],
  'Connect your wallet to sign in.': [
    'Connect your wallet to sign in.',
    '连接钱包以登录。',
  ],
  'Connect to open current statuses.': [
    'Connect to open current statuses.',
    '请联网以打开当前状态。',
  ],
  'Connect to check current group membership.': [
    'Connect to check current group membership.',
    '请联网以检查当前群组成员。',
  ],
  'Connection missing.': ['Connection missing.', '缺少连接。'],
  'Connection confirmed. Tap “Confirm message in Phantom”, check the test message and sign. Your wallet will request a return to this site.':
    [
      'Connection confirmed. Tap “Confirm message in Phantom”, check the test message and sign. Your wallet will request a return to this site.',
      '连接已确认。请点击“在 Phantom 中确认消息”，检查测试消息并签名。钱包将请求返回此网站。',
    ],
  'Direct connection rejected.': [
    'Direct connection rejected.',
    '直接连接被拒绝。',
  ],
  'Connection available · no account connected': [
    'Connection available · no account connected',
    '网络可用 · 尚未连接账户',
  ],
  'Connection ended.': ['Connection ended.', '连接已结束。'],
  'Message verification superseded by a new notice.': [
    'Message verification superseded by a new notice.',
    '消息核验已被新通知替代。',
  ],
  'Check state': ['Check state', '检查状态'],
  'Setting applied on this device, but not saved to your account': [
    'Setting applied on this device, but not saved to your account',
    '设置已在此设备上应用，但尚未保存到账户',
  ],
  'Invalid account settings.': ['Invalid account settings.', '账户设置无效。'],
  'Settings unavailable.': ['Settings unavailable.', '设置不可用。'],
  'Settings belong to another account.': [
    'Settings belong to another account.',
    '设置属于另一个账户。',
  ],
  'Configurações da conta': ['Account settings', '账户设置'],
  'Too many account settings versions in the vault.': [
    'Too many account settings versions in the vault.',
    '保险库中的账户设置版本过多。',
  ],
  'Initial settings': ['Initial settings', '初始设置'],
  'Initial settings unavailable.': [
    'Initial settings unavailable.',
    '初始设置不可用。',
  ],
  "Check this device's authorization to open statuses.": [
    "Check this device's authorization to open statuses.",
    '请检查此设备的授权以打开状态。',
  ],
  'Check the photo and tap Publish status.': [
    'Check the photo and tap Publish status.',
    '请检查图片，然后点击“发布状态”。',
  ],
  'Check the domain and address in your wallet and sign only the sign-in request.':
    [
      'Check the domain and address in your wallet and sign only the sign-in request.',
      '请核对钱包中的域名和地址，并仅签署登录请求。',
    ],
  'Check the private nickname and explicitly save it in contacts.': [
    'Check the private nickname and explicitly save it in contacts.',
    '请核对私密备注名，并主动保存到联系人。',
  ],
  'Check a valid code before authorizing.': [
    'Check a valid code before authorizing.',
    '授权前请核对有效代码。',
  ],
  'Authorization confirmation does not match. Refresh to check the saved state.':
    [
      'Authorization confirmation does not match. Refresh to check the saved state.',
      '授权确认不匹配。请刷新以检查已保存的状态。',
    ],
  'Invalid cleanup confirmation. Check the state before retrying.': [
    'Invalid cleanup confirmation. Check the state before retrying.',
    '清理确认无效。请检查状态后重试。',
  ],
  'Confirmation does not match. Draft preserved; sync to check.': [
    'Confirmation does not match. Draft preserved; sync to check.',
    '确认不匹配。草稿已保留；请同步以核对。',
  ],
  'Invalid QR code confirmation.': [
    'Invalid QR code confirmation.',
    '二维码确认无效。',
  ],
  'Invalid DM confirmations.': ['Invalid DM confirmations.', '私信确认无效。'],
  'Invalid confirmations.': ['Invalid confirmations.', '确认信息无效。'],
  'Confirm changes': ['Confirm changes', '确认更改'],
  'Confirm signature': ['Confirm signature', '确认签名'],
  'Confirm signature · 0xDMme': [
    'Confirm signature · 0xDMme',
    '确认签名 · 0xDMme',
  ],
  'Confirm signature in {0}': ['Confirm signature in {0}', '在 {0} 中确认签名'],
  'Confirm message in Phantom': [
    'Confirm message in Phantom',
    '在 Phantom 中确认消息',
  ],
  'Confirm vault reset': ['Confirm vault reset', '确认重置保险库'],
  'Confirm account opening in your wallet.': [
    'Confirm account opening in your wallet.',
    '请在钱包中确认打开账户。',
  ],
  'Confirm the membership change.': [
    'Confirm the membership change.',
    '确认成员变更。',
  ],
  'Confirm the signature for the request started in your browser.': [
    'Confirm the signature for the request started in your browser.',
    '请确认在你浏览器中发起的请求签名。',
  ],
  'Confirm the signature to complete sign-in in the browser that started the request. Reject requests received from others.':
    [
      'Confirm the signature to complete sign-in in the browser that started the request. Reject requests received from others.',
      '请确认签名，以在发起请求的浏览器中完成登录。请拒绝他人发来的请求。',
    ],
  "Confirm the other client's key before sending.": [
    "Confirm the other client's key before sending.",
    '发送前请确认另一个客户端的密钥。',
  ],
  "Confirm the other client's key before receiving.": [
    "Confirm the other client's key before receiving.",
    '接收前请确认另一个客户端的密钥。',
  ],
  'Confirm the connection in {0}.': [
    'Confirm the connection in {0}.',
    '请在 {0} 中确认连接。',
  ],
  'Confirm the connection in Phantom. If opening is blocked, tap “Open Phantom”.':
    [
      'Confirm the connection in Phantom. If opening is blocked, tap “Open Phantom”.',
      '请在 Phantom 中确认连接。如果无法打开，请点击“打开 Phantom”。',
    ],
  'Confirm public profile creation.': [
    'Confirm public profile creation.',
    '确认创建公开个人资料。',
  ],
  'Confirm post deletion.': ['Confirm post deletion.', '确认删除帖子。'],
  'Confirm badge deletion.': ['Confirm badge deletion.', '确认删除徽章。'],
  'Confirm the wallet for the account already open on this device.': [
    'Confirm the wallet for the account already open on this device.',
    '请确认此设备上已打开账户的钱包。',
  ],
  "Confirm your account's wallet to enable sensitive actions in this session.":
    [
      "Confirm your account's wallet to enable sensitive actions in this session.",
      '请确认账户钱包，以在此会话中执行敏感操作。',
    ],
  'Confirm your wallet to link another device.': [
    'Confirm your wallet to link another device.',
    '请确认钱包以关联另一台设备。',
  ],
  'Confirm sign-in in your browser': [
    'Confirm sign-in in your browser',
    '在浏览器中确认登录',
  ],
  'Confirm your wallet once in this session, then return to Vault to complete the reset.':
    [
      'Confirm your wallet once in this session, then return to Vault to complete the reset.',
      '请在此会话中确认一次钱包，然后返回“保险库”完成重置。',
    ],
  'Conflict or test message limit reached.': [
    'Conflict or test message limit reached.',
    '发生冲突或达到测试消息上限。',
  ],
  'Group key lookup incomplete. Refresh before resuming the send.': [
    'Group key lookup incomplete. Refresh before resuming the send.',
    '群组密钥查询不完整。请刷新后再恢复发送。',
  ],
  'Invalid invitation lookup.': [
    'Invalid invitation lookup.',
    '邀请查询无效。',
  ],
  'Lookup at {0}: {1}': ['Lookup at {0}: {1}', '在 {0} 查询：{1}'],
  'Checking storage…': ['Checking storage…', '正在检查存储空间…'],
  'Checking account contacts…': [
    'Checking account contacts…',
    '正在查询账户联系人…',
  ],
  'Checking group availability…': [
    'Checking group availability…',
    '正在查询群组可用性…',
  ],
  'Checking account usage…': ['Checking account usage…', '正在查询账户用量…'],
  'Checking…': ['Checking…', '正在查询…'],
  'View moderation history': ['View moderation history', '查看审核历史'],
  'Account changed.': ['Account changed.', '账户已更改。'],
  'Account connected': ['Account connected', '账户已连接'],
  'Group account missing.': ['Group account missing.', '缺少群组账户。'],
  'Account does not match the directory.': [
    'Account does not match the directory.',
    '账户与目录不匹配。',
  ],
  'Test account is not canonical.': [
    'Test account is not canonical.',
    '测试账户格式不规范。',
  ],
  'EVM / Solana account · Private messages': [
    'EVM / Solana account · Private messages',
    'EVM / Solana 账户 · 私密消息',
  ],
  'No account connected': ['No account connected', '尚未连接账户'],
  'Account ready.': ['Account ready.', '账户已就绪。'],
  'Removed account': ['Removed account', '已移除账户'],
  'Account: {0}': ['Account: {0}', '账户：{0}'],
  'Count available; this view could not be confirmed.': [
    'Count available; this view could not be confirmed.',
    '浏览数可用；本次浏览未能确认。',
  ],
  'Count unavailable.': ['Count unavailable.', '浏览数不可用。'],
  Contact: ['Contact', '联系人'],
  'Contact {0}': ['Contact {0}', '联系人 {0}'],
  'Contact opened only on this device.': [
    'Contact opened only on this device.',
    '联系人仅在此设备上打开。',
  ],
  'Contact added to the group.': [
    'Contact added to the group.',
    '联系人已添加到群组。',
  ],
  'Approved contact {0}': ['Approved contact {0}', '已批准联系人 {0}'],
  'Contact approved in both directions.': [
    'Contact approved in both directions.',
    '双方已批准联系。',
  ],
  'Contact to forward to': ['Contact to forward to', '转发给联系人'],
  'Private contact confirmed in the vault. This did not approve a conversation.':
    [
      'Private contact confirmed in the vault. This did not approve a conversation.',
      '私密联系人已在保险库中确认。这不代表批准聊天。',
    ],
  'Representative contact': ['Representative contact', '代表联系人'],
  'Contact saved on this device. It will be sent when the connection returns.':
    [
      'Contact saved on this device. It will be sent when the connection returns.',
      '联系人已保存在此设备上。恢复连接后会发送。',
    ],
  'Contacts updated.': ['Contacts updated.', '联系人已更新。'],
  'Contacts exceed the backup limit.': [
    'Contacts exceed the backup limit.',
    '联系人超过备份上限。',
  ],
  'Removal appeal': ['Removal appeal', '移除申诉'],
  'Appeal recorded for exceptional review.': [
    'Appeal recorded for exceptional review.',
    '申诉已记录，等待特殊复核。',
  ],
  'Appeal: {0}': ['Appeal: {0}', '申诉：{0}'],
  'Appeal analysis': ['Appeal analysis', '对分析结果申诉'],
  'Appeal removal': ['Appeal removal', '对移除决定申诉'],
  'Appeal sanction': ['Appeal sanction', '对处罚申诉'],
  'Analyzed content': ['Analyzed content', '已分析内容'],
  'Group content exceeds the limit.': [
    'Group content exceeds the limit.',
    '群组内容超过限制。',
  ],
  'Group content does not match the authenticated package.': [
    'Group content does not match the authenticated package.',
    '群组内容与已验证的数据包不一致。',
  ],
  'Status content does not match.': [
    'Status content does not match.',
    '状态内容不匹配。',
  ],
  'Content must be no larger than 3 MB.': [
    'Content must be no larger than 3 MB.',
    '内容大小不得超过 3 MB。',
  ],
  'Vault content exceeds the limit.': [
    'Vault content exceeds the limit.',
    '保险库内容超过限制。',
  ],
  'Content exceeds the permitted size.': [
    'Content exceeds the permitted size.',
    '内容超过允许的大小。',
  ],
  'Content deleted by the author.': [
    'Content deleted by the author.',
    '内容已被作者删除。',
  ],
  'Invalid fictional content.': [
    'Invalid fictional content.',
    '虚构内容无效。',
  ],
  'Local content differs from the group message.': [
    'Local content differs from the group message.',
    '本地内容与群组消息不一致。',
  ],
  'Local content differs from the remote vault.': [
    'Local content differs from the remote vault.',
    '本地内容与远程保险库不一致。',
  ],
  'Local content differs from the verified package.': [
    'Local content differs from the verified package.',
    '本地内容与已验证的数据包不一致。',
  ],
  'Content does not match the authenticated message.': [
    'Content does not match the authenticated message.',
    '内容与已验证的消息不一致。',
  ],
  'Content hidden by moderation.': [
    'Content hidden by moderation.',
    '内容已被审核隐藏。',
  ],
  'Content hidden from your feeds': [
    'Content hidden from your feeds',
    '已从你的动态中隐藏的内容',
  ],
  'Content restricted to the author and managers.': [
    'Content restricted to the author and managers.',
    '内容仅作者与管理员可见。',
  ],
  'Keep editing': ['Keep editing', '继续编辑'],
  'Continue this thread →': ['Continue this thread →', '继续此讨论串 →'],
  'Continue the conversation.': ['Continue the conversation.', '继续对话。'],
  'Continue loading before resuming.': [
    'Continue loading before resuming.',
    '请继续加载后再恢复。',
  ],
  'Continue loading personal removals.': [
    'Continue loading personal removals.',
    '继续加载个人移除记录。',
  ],
  'Continue loading the vault before editing.': [
    'Continue loading the vault before editing.',
    '请继续加载保险库后再编辑。',
  ],
  "Continue in this wallet to open your account's keys.": [
    "Continue in this wallet to open your account's keys.",
    '请继续在此钱包中操作，以打开账户密钥。',
  ],
  'Continue syncing personal removals before opening content.': [
    'Continue syncing personal removals before opening content.',
    '请继续同步个人移除记录后再打开内容。',
  ],
  'Continue syncing DM history.': [
    'Continue syncing DM history.',
    '继续同步私信历史。',
  ],
  'Domain control verified': ['Domain control verified', '域名控制权已验证'],
  'Domain control verified.': [
    'Domain control verified.',
    '域名控制权已验证。',
  ],
  Conversation: ['Conversation', '对话'],
  'Conversation changed.': ['Conversation changed.', '对话已更改。'],
  'Backup conversation': ['Backup conversation', '备份对话'],
  'Local history conversation': ['Local history conversation', '本地历史对话'],
  'Historical conversation belongs to another DM.': [
    'Historical conversation belongs to another DM.',
    '历史对话属于另一条私信。',
  ],
  'Historical conversation belongs to another group.': [
    'Historical conversation belongs to another group.',
    '历史对话属于另一个群组。',
  ],
  'Invalid historical conversation.': [
    'Invalid historical conversation.',
    '历史对话无效。',
  ],
  'Handle conversation incomplete.': [
    'Handle conversation incomplete.',
    '用户名对话不完整。',
  ],
  Chat: ['Chat', '聊天'],
  Conversations: ['Conversations', '对话'],
  'Conversations updated.': ['Conversations updated.', '对话已更新。'],
  'Conversations and files stay encrypted. Saving a backup does not automatically free space.':
    [
      'Conversations and files stay encrypted. Saving a backup does not automatically free space.',
      '对话和文件保持加密。保存备份不会自动释放空间。',
    ],
  'Conversations started': ['Conversations started', '发起的讨论'],
  'Invitation active, but its encrypted copy was not confirmed. Keep the link or revoke it before leaving.':
    [
      'Invitation active, but its encrypted copy was not confirmed. Keep the link or revoke it before leaving.',
      '邀请已启用，但加密副本未确认。离开前请保留链接或撤销邀请。',
    ],
  'Invitation active; its encrypted copy will be sent automatically when reconnected.':
    [
      'Invitation active; its encrypted copy will be sent automatically when reconnected.',
      '邀请已启用；恢复连接后会自动发送加密副本。',
    ],
  'Invalid group invitation.': ['Invalid group invitation.', '群组邀请无效。'],
  'Invitation belongs to another account.': [
    'Invitation belongs to another account.',
    '邀请属于另一个账户。',
  ],
  'Invitation unavailable, revoked or restricted by current privacy settings.':
    [
      'Invitation unavailable, revoked or restricted by current privacy settings.',
      '邀请不可用、已撤销，或受当前隐私设置限制。',
    ],
  'Invalid invitation. Check the full link.': [
    'Invalid invitation. Check the full link.',
    '邀请无效。请核对完整链接。',
  ],
  'Invitation declined.': ['Invitation declined.', '邀请已拒绝。'],
  'Invitation revoked. Old links cannot start new requests.': [
    'Invitation revoked. Old links cannot start new requests.',
    '邀请已撤销。旧链接无法发起新请求。',
  ],
  'Invitation has no verified administrative membership.': [
    'Invitation has no verified administrative membership.',
    '邀请缺少已验证的管理成员身份。',
  ],
  'Group invitations': ['Group invitations', '群组邀请'],
  'Invalid group invitations.': [
    'Invalid group invitations.',
    '群组邀请无效。',
  ],
  'DM copy differs from preserved history.': [
    'DM copy differs from preserved history.',
    '私信副本与保留的历史不一致。',
  ],
  'Group copy differs from preserved history.': [
    'Group copy differs from preserved history.',
    '群组副本与保留的历史不一致。',
  ],
  'Copy belongs to another group or account.': [
    'Copy belongs to another group or account.',
    '副本属于另一个群组或账户。',
  ],
  'Historical copy belongs to another account or group.': [
    'Historical copy belongs to another account or group.',
    '历史副本属于另一个账户或群组。',
  ],
  'Local copy': ['Local copy', '本地副本'],
  'Local copy · content unavailable in the remote vault': [
    'Local copy · content unavailable in the remote vault',
    '本地副本 · 远程保险库中的内容不可用',
  ],
  'Local copy only. Sign in and check authorization to sync with the server.': [
    'Local copy only. Sign in and check authorization to sync with the server.',
    '仅有本地副本。请登录并核对授权后与服务器同步。',
  ],
  'Local group copy missing.': [
    'Local group copy missing.',
    '缺少群组本地副本。',
  ],
  'local group copy': ['local group copy', '群组本地副本'],
  'Independent local copy · this copy grants no remote access': [
    'Independent local copy · this copy grants no remote access',
    '独立本地副本 · 此副本不授予远程访问权限',
  ],
  'Independent local copy. Sending and administration require verified current membership.':
    [
      'Independent local copy. Sending and administration require verified current membership.',
      '独立本地副本。发送和管理需要验证当前成员身份。',
    ],
  'Local copy not authorized.': [
    'Local copy not authorized.',
    '本地副本未获授权。',
  ],
  'Local copy not confirmed. Check browser storage and available space.': [
    'Local copy not confirmed. Check browser storage and available space.',
    '本地副本未确认。请检查浏览器存储和可用空间。',
  ],
  'Cópia local offline · estado remoto ainda não conferido': [
    'Offline local copy · remote state not yet checked',
    '离线本地副本 · 尚未核对远程状态',
  ],
  'Local copy. Connect to sync and send messages.': [
    'Local copy. Connect to sync and send messages.',
    '本地副本。联网后可同步和发送消息。',
  ],
  'Copy on this device': ['Copy on this device', '此设备上的副本'],
  'Invalid verified copy.': ['Invalid verified copy.', '已验证副本无效。'],
  'Copy text': ['Copy text', '复制文字'],
  'Historical copies differ. Preserve the original files before resolving.': [
    'Historical copies differ. Preserve the original files before resolving.',
    '历史副本不一致。解决前请保留原始文件。',
  ],
  'Local group copies do not match.': [
    'Local group copies do not match.',
    '群组本地副本不匹配。',
  ],
  'Brand color': ['Brand color', '品牌颜色'],
  Correct: ['Correct', '修正'],
  'Correct image {0} · current annotation: {1}': [
    'Correct image {0} · current annotation: {1}',
    '修正图片 {0} · 当前标注：{1}',
  ],
  'TURN credential missing.': ['TURN credential missing.', '缺少 TURN 凭据。'],
  'Free creation, with no total limit. Up to one creation per minute and ten per hour.':
    [
      'Free creation, with no total limit. Up to one creation per minute and ten per hour.',
      '免费创建，总数量不限。每分钟最多创建 1 个，每小时最多 10 个。',
    ],
  'Invalid local creation.': ['Invalid local creation.', '本地创建无效。'],
  'Creation not confirmed. Resume the same request.': [
    'Creation not confirmed. Resume the same request.',
    '创建未确认。请继续同一请求。',
  ],
  'Created on {0}': ['Created on {0}', '创建于 {0}'],
  'Create badge': ['Create badge', '创建徽章'],
  'Create community': ['Create community', '创建社区'],
  'Create invitation': ['Create invitation', '创建邀请'],
  'Create and sign organization': [
    'Create and sign organization',
    '创建组织并签名',
  ],
  'Create group': ['Create group', '创建群组'],
  'Create private group': ['Create private group', '创建私密群组'],
  'Create profile to follow': [
    'Create profile to follow',
    '创建个人资料以关注',
  ],
  'Create post': ['Create post', '创建帖子'],
  'Create tag': ['Create tag', '创建标签'],
  'Create another contact for a different wallet.': [
    'Create another contact for a different wallet.',
    '请为其他钱包创建新的联系人。',
  ],
  'Create your public profile to follow.': [
    'Create your public profile to follow.',
    '创建公开个人资料即可关注。',
  ],
  'Create your public profile first.': [
    'Create your public profile first.',
    '请先创建公开个人资料。',
  ],
  'Create an invitation first.': [
    'Create an invitation first.',
    '请先创建邀请。',
  ],
  'Data after backup completion.': [
    'Data after backup completion.',
    '备份结束后仍有数据。',
  ],
  'Creation date not recorded': [
    'Creation date not recorded',
    '未记录创建日期',
  ],
  'Date not recorded': ['Date not recorded', '未记录日期'],
  'Give your post a title.': ['Give your post a title.', '为帖子添加标题。'],
  Unfollow: ['Unfollow', '取消关注'],
  'Report sent.': ['Report sent.', '举报已发送。'],
  "Report saved on the app's backend.": [
    "Report saved on the app's backend.",
    '举报已保存在应用后端。',
  ],
  'Report not confirmed.': ['Report not confirmed.', '举报未确认。'],
  Report: ['Report', '举报'],
  'Report post': ['Report post', '举报帖子'],
  'Report user': ['Report user', '举报用户'],
  'Community reports': ['Community reports', '社区举报'],
  Unpin: ['Unpin', '取消置顶'],
  Unarchive: ['Unarchive', '取消归档'],
  'Unarchive the conversation before changing or resuming alerts.': [
    'Unarchive the conversation before changing or resuming alerts.',
    '请先取消归档对话，再更改或恢复通知。',
  ],
  'Disable post and reply notifications': [
    'Disable post and reply notifications',
    '关闭帖子与回复通知',
  ],
  'Disable incoming calls': ['Disable incoming calls', '关闭来电'],
  'Disable sounds': ['Disable sounds', '关闭声音'],
  Unblock: ['Unblock', '解除屏蔽'],
  'Unblock user': ['Unblock user', '解除用户屏蔽'],
  Discard: ['Discard', '丢弃'],
  'Discard post?': ['Discard post?', '丢弃帖子？'],
  'Discard reply?': ['Discard reply?', '丢弃回复？'],
  Discover: ['Discover', '探索'],
  Description: ['Description', '简介'],
  'Invalid emoji artwork.': ['Invalid emoji artwork.', '表情图案无效。'],
  'Device artwork: graphic package unavailable.': [
    'Device artwork: graphic package unavailable.',
    '使用设备表情：图案包不可用。',
  ],
  'Emoji artwork missing.': ['Emoji artwork missing.', '缺少表情图案。'],
  'Emoji artwork incomplete.': [
    'Emoji artwork incomplete.',
    '表情图案不完整。',
  ],
  "Artwork unavailable. You can still choose emoji using this device's appearance.":
    [
      "Artwork unavailable. You can still choose emoji using this device's appearance.",
      '表情图案不可用。你仍可选择使用此设备样式的表情。',
    ],
  'Twemoji artwork · CC-BY-4.0 · Recents only in this session': [
    'Twemoji artwork · CC-BY-4.0 · Recents only in this session',
    'Twemoji 图案 · CC-BY-4.0 · 最近使用仅保留于此会话',
  ],
  Highlights: ['Highlights', '精选'],
  'Recipient, recovery or text missing.': [
    'Recipient, recovery or text missing.',
    '缺少接收者、恢复信息或文字。',
  ],
  'Destination changed.': ['Destination changed.', '目标已更改。'],
  'Sign-in destination changed.': [
    'Sign-in destination changed.',
    '登录目标已更改。',
  ],
  'Wallet destination changed.': [
    'Wallet destination changed.',
    '钱包目标已更改。',
  ],
  'Unlink domain': ['Unlink domain', '取消关联域名'],
  Detected: ['Detected', '已检测到'],
  'Type to find a conversation or search for words in messages.': [
    'Type to find a conversation or search for words in messages.',
    '输入以查找对话，或搜索消息中的文字。',
  ],
  'Old contact directory.': ['Old contact directory.', '联系人目录已过时。'],
  'Directory outdated, omitted or inconsistent.': [
    'Directory outdated, omitted or inconsistent.',
    '目录过时、缺失或不一致。',
  ],
  'Directory missing.': ['Directory missing.', '缺少目录。'],
  'Call directory does not match.': [
    'Call directory does not match.',
    '通话目录不匹配。',
  ],
  'DM directory missing.': ['DM directory missing.', '缺少私信目录。'],
  'DM directory disappeared.': [
    'DM directory disappeared.',
    '私信目录已消失。',
  ],
  'DM directory exceeds the limit.': [
    'DM directory exceeds the limit.',
    '私信目录超过限制。',
  ],
  'DM directory rolled back.': [
    'DM directory rolled back.',
    '私信目录已回退。',
  ],
  'Member directory missing.': ['Member directory missing.', '缺少成员目录。'],
  'Source directory changed.': [
    'Source directory changed.',
    '来源目录已更改。',
  ],
  'Directory belongs to another page or is duplicated.': [
    'Directory belongs to another page or is duplicated.',
    '目录属于其他页面或已重复。',
  ],
  'Directory belongs to another public profile.': [
    'Directory belongs to another public profile.',
    '目录属于另一个公开个人资料。',
  ],
  'Directory differs from the pinned identity.': [
    'Directory differs from the pinned identity.',
    '目录与固定身份不一致。',
  ],
  'Contact directory does not match.': [
    'Contact directory does not match.',
    '联系人目录不匹配。',
  ],
  'Directory does not match.': ['Directory does not match.', '目录不匹配。'],
  'Author directory exceeds the limit.': [
    'Author directory exceeds the limit.',
    '作者目录超过限制。',
  ],
  'Contact directory missing.': [
    'Contact directory missing.',
    '缺少联系人目录。',
  ],
  'Contact directory exceeds the limit.': [
    'Contact directory exceeds the limit.',
    '联系人目录超过限制。',
  ],
  'Invalid contact directory.': [
    'Invalid contact directory.',
    '联系人目录无效。',
  ],
  'Contact directory omitted.': [
    'Contact directory omitted.',
    '联系人目录缺失。',
  ],
  'Group directory missing.': ['Group directory missing.', '缺少群组目录。'],
  'Directory exceeds the limit or changed repeatedly.': [
    'Directory exceeds the limit or changed repeatedly.',
    '目录超过限制或被反复更改。',
  ],
  'Directory exceeds the limit.': [
    'Directory exceeds the limit.',
    '目录超过限制。',
  ],
  'Directory incomplete.': ['Directory incomplete.', '目录不完整。'],
  'Directory omitted or invalid.': [
    'Directory omitted or invalid.',
    '目录缺失或无效。',
  ],
  'Directory omitted.': ['Directory omitted.', '目录缺失。'],
  'Directory replaced a Matrix key.': [
    'Directory replaced a Matrix key.',
    '目录替换了 Matrix 密钥。',
  ],
  'Recipient directories incomplete.': [
    'Recipient directories incomplete.',
    '接收者目录不完整。',
  ],
  'Pinned directories do not match.': [
    'Pinned directories do not match.',
    '固定目录不匹配。',
  ],
  'Post discussion': ['Post discussion', '帖子讨论'],
  'Available in this browser': ['Available in this browser', '此浏览器中可用'],
  'Available for new posts': ['Available for new posts', '可用于新帖子'],
  'Device missing: sending remains blocked.': [
    'Device missing: sending remains blocked.',
    '缺少设备：发送仍被阻止。',
  ],
  'Device revoked and session rotated. The other client cannot open the new package; previous copies remain readable.':
    [
      'Device revoked and session rotated. The other client cannot open the new package; previous copies remain readable.',
      '设备授权已撤销，会话已轮换。另一客户端无法打开新数据包；旧副本仍可读取。',
    ],
  'Device revoked in this session.': [
    'Device revoked in this session.',
    '此会话中的设备授权已撤销。',
  ],
  'Devices changed. Reload the profile before saving.': [
    'Devices changed. Reload the profile before saving.',
    '设备已更改。请重新加载个人资料后再保存。',
  ],
  'Connected devices': ['Connected devices', '已连接设备'],
  'DM ended.': ['DM ended.', '私信已结束。'],
  'DM unavailable.': ['DM unavailable.', '私信不可用。'],
  'dm-media:{0} unavailable': [
    'dm-media:{0} unavailable',
    'dm-media:{0} 不可用',
  ],
  'dm-message:{0} unavailable': [
    'dm-message:{0} unavailable',
    'dm-message:{0} 不可用',
  ],
  'DMs unavailable.': ['DMs unavailable.', '私信不可用。'],
  'Individual DMs · E2EE': ['Individual DMs · E2EE', '一对一私信 · 端到端加密'],
  'Domain (optional)': ['Domain (optional)', '域名（选填）'],
  'Domain unlinked.': ['Domain unlinked.', '域名关联已取消。'],
  Owner: ['Owner', '所有者'],
  'Owner and moderators': ['Owner and moderators', '所有者与管理员'],
  'Two identical signatures; fictional package encrypted and saved. Reload and test recovery. This does not verify another device or wallet implementation.':
    [
      'Two identical signatures; fictional package encrypted and saved. Reload and test recovery. This does not verify another device or wallet implementation.',
      '两次签名一致；虚构数据包已加密并保存。请刷新并测试恢复。这不代表已验证其他设备或钱包实现。',
    ],
  Duration: ['Duration', '时长'],
  Edit: ['Edit', '编辑'],
  'Editing changes text only; remove the selected attachment.': [
    'Editing changes text only; remove the selected attachment.',
    '编辑仅更改文字；请移除所选附件。',
  ],
  'Edit by another author.': ['Edit by another author.', '编辑来自其他作者。'],
  Edited: ['Edited', '已编辑'],
  Editing: ['Editing', '正在编辑'],
  'Edit private contact': ['Edit private contact', '编辑私密联系人'],
  'Edit public profile': ['Edit public profile', '编辑公开个人资料'],
  'Edit post': ['Edit post', '编辑帖子'],
  emerging: ['emerging', '成长中'],
  'Replying to @{0}': ['Replying to @{0}', '回复 @{0}'],
  'Replying to a removed account': [
    'Replying to a removed account',
    '回复已移除的账户',
  ],
  'Replying to: {0}': ['Replying to: {0}', '回复：{0}'],
  'in a post': ['in a post', '在帖子中'],
  'in a reply': ['in a reply', '在回复中'],
  'Issuance date is in the future.': [
    'Issuance date is in the future.',
    '签发日期在未来。',
  ],
  "Issuance recorded. Send the card in the representative's conversation.": [
    "Issuance recorded. Send the card in the representative's conversation.",
    '签发已记录。请在与代表的对话中发送卡片。',
  ],
  'Issuer: {0} · {1}': ['Issuer: {0} · {1}', '签发者：{0} · {1}'],
  'Issue authorization': ['Issue authorization', '签发授权'],
  Emoji: ['Emoji', '表情'],
  Forwarded: ['Forwarded', '已转发'],
  Forward: ['Forward', '转发'],
  'Ended: {0}': ['Ended: {0}', '已结束：{0}'],
  'Signing out…': ['Signing out…', '正在退出登录…'],
  End: ['End', '结束'],
  'Close report': ['Close report', '结束举报'],
  'End the current call first.': [
    'End the current call first.',
    '请先结束当前通话。',
  ],
  'Incompatible image encoder.': [
    'Incompatible image encoder.',
    '图片编码器不兼容。',
  ],
  'Verified address ({0}): {1}. Only confirm if this is the account you chose.':
    [
      'Verified address ({0}): {1}. Only confirm if this is the account you chose.',
      '已验证地址（{0}）：{1}。仅在确为你选择的账户时确认。',
    ],
  'Non-TURN endpoint rejected.': [
    'Non-TURN endpoint rejected.',
    '非 TURN 端点被拒绝。',
  ],
  'Test in progress. Check the exclusive message in your wallet.': [
    'Test in progress. Check the exclusive message in your wallet.',
    '测试正在进行。请核对钱包中的专用消息。',
  ],
  'Test interrupted; reload before retrying.': [
    'Test interrupted; reload before retrying.',
    '测试已中断；请刷新后重试。',
  ],
  'Test refused. Check the account, signature and storage availability; no success was confirmed.':
    [
      'Test refused. Check the account, signature and storage availability; no success was confirmed.',
      '测试被拒绝。请检查账户、签名和存储可用性；未确认成功。',
    ],
  'Test rejected. Check local artifacts and browser compatibility.': [
    'Test rejected. Check local artifacts and browser compatibility.',
    '测试被拒绝。请检查本地文件和浏览器兼容性。',
  ],
  'Sign-in interrupted.': ['Sign-in interrupted.', '登录已中断。'],
  'Invalid entry.': ['Invalid entry.', '输入无效。'],
  'Sign-in not confirmed.': ['Sign-in not confirmed.', '登录未确认。'],
  'Joining the group was not confirmed.': [
    'Joining the group was not confirmed.',
    '加入群组未确认。',
  ],
  'Invalid pending entry.': ['Invalid pending entry.', '待处理条目无效。'],
  'Sign in': ['Sign in', '登录'],
  'Join private group': ['Join private group', '加入私密群组'],
  'Joining adds the group to your conversation list.': [
    'Joining adds the group to your conversation list.',
    '加入后，群组会出现在对话列表中。',
  ],
  'Sign in to your account': ['Sign in to your account', '登录账户'],
  'Join group': ['Join group', '加入群组'],
  'Sign in to follow': ['Sign in to follow', '登录以关注'],
  'Sign in through Profile': ['Sign in through Profile', '通过“个人资料”登录'],
  'Join by link': ['Join by link', '通过链接加入'],
  "Sign in with the original wallet and authorize or recover this device's keys.":
    [
      "Sign in with the original wallet and authorize or recover this device's keys.",
      '请使用原钱包登录，并授权或恢复此设备的密钥。',
    ],
  'Sign in with your wallet or use a linking code.': [
    'Sign in with your wallet or use a linking code.',
    '使用钱包或关联码登录。',
  ],
  'Sign in and authorize this device to open statuses.': [
    'Sign in and authorize this device to open statuses.',
    '请登录并授权此设备以打开状态。',
  ],
  'Sign in and authorize this device to chat.': [
    'Sign in and authorize this device to chat.',
    '请登录并授权此设备以聊天。',
  ],
  'Sign in and authorize this device to use private groups.': [
    'Sign in and authorize this device to use private groups.',
    '请登录并授权此设备以使用私密群组。',
  ],
  'Sign in and authorize this device first.': [
    'Sign in and authorize this device first.',
    '请先登录并授权此设备。',
  ],
  'Sign in and authorize this device.': [
    'Sign in and authorize this device.',
    '请登录并授权此设备。',
  ],
  'Sign in and connect to open statuses.': [
    'Sign in and connect to open statuses.',
    '请登录并联网以打开状态。',
  ],
  'Sign in and connect to check current permissions.': [
    'Sign in and connect to check current permissions.',
    '请登录并联网以检查当前权限。',
  ],
  'Sign in and create your public profile in Profile to participate.': [
    'Sign in and create your public profile in Profile to participate.',
    '请登录并在“个人资料”中创建公开个人资料以参与。',
  ],
  'Sign in and sync to check this list.': [
    'Sign in and sync to check this list.',
    '请登录并同步以查看此列表。',
  ],
  'Sign in and wait for the current operation.': [
    'Sign in and wait for the current operation.',
    '请登录并等待当前操作完成。',
  ],
  'Sign in to see requests, invitations and publications.': [
    'Sign in to see requests, invitations and publications.',
    '登录后可查看请求、邀请和发布内容。',
  ],
  'Sign in to your account to check storage.': [
    'Sign in to your account to check storage.',
    '请登录账户以查看存储空间。',
  ],
  'Sign in to your account.': ['Sign in to your account.', '请登录账户。'],
  'Sign in to see the communities you follow.': [
    'Sign in to see the communities you follow.',
    '登录后可查看已关注的社区。',
  ],
  'Sign in with your wallet to view your handle messages.': [
    'Sign in with your wallet to view your handle messages.',
    '请使用钱包登录以查看用户名私信。',
  ],
  'Sign in through Profile to open your handle messages.': [
    'Sign in through Profile to open your handle messages.',
    '请通过“个人资料”登录以打开用户名私信。',
  ],
  'Sign in through Profile to access your list': [
    'Sign in through Profile to access your list',
    '通过“个人资料”登录以访问列表',
  ],
  'Sign in through Profile to share': [
    'Sign in through Profile to share',
    '通过“个人资料”登录以分享',
  ],
  'Sign in through Profile to create a post.': [
    'Sign in through Profile to create a post.',
    '请通过“个人资料”登录以创建帖子。',
  ],
  'Sign in through Profile to participate': [
    'Sign in through Profile to participate',
    '通过“个人资料”登录以参与',
  ],
  'Sign in through Profile to reply': [
    'Sign in through Profile to reply',
    '通过“个人资料”登录以回复',
  ],
  'Sign in through Profile to vote': [
    'Sign in through Profile to vote',
    '通过“个人资料”登录以投票',
  ],
  'Sign in first.': ['Sign in first.', '请先登录。'],
  'Delivery suspended: renewed consent is required.': [
    'Delivery suspended: renewed consent is required.',
    '送达已暂停：需要重新同意。',
  ],
  'Encrypted envelope received. Enter the secret to open it locally.': [
    'Encrypted envelope received. Enter the secret to open it locally.',
    '已取得加密封装。请输入密钥以在本地打开。',
  ],
  'Sent on {0}.': ['Sent on {0}.', '发送于 {0}。'],
  'Uploading attachment: part {0} of {1}. Closing the app pauses the transfer; the encrypted draft is preserved.':
    [
      'Uploading attachment: part {0} of {1}. Closing the app pauses the transfer; the encrypted draft is preserved.',
      '正在上传附件：第 {0} 部分，共 {1} 部分。关闭应用会暂停传输；加密草稿会保留。',
    ],
  Send: ['Send', '发送'],
  'Send authorization for acceptance': [
    'Send authorization for acceptance',
    '发送授权以请求接受',
  ],
  'Submit appeal': ['Submit appeal', '提交申诉'],
  'Submit report': ['Submit report', '提交举报'],
  'Send or remove the voice preview before blocking the contact.': [
    'Send or remove the voice preview before blocking the contact.',
    '屏蔽联系人前，请发送或移除语音预览。',
  ],
  'Send or remove the voice preview before changing conversations.': [
    'Send or remove the voice preview before changing conversations.',
    '切换对话前，请发送或移除语音预览。',
  ],
  'Send or remove the voice preview before changing recipients.': [
    'Send or remove the voice preview before changing recipients.',
    '更换接收者前，请发送或移除语音预览。',
  ],
  'Upload complete': ['Upload complete', '上传完成'],
  'Media upload unavailable. Try again.': [
    'Media upload unavailable. Try again.',
    '媒体上传不可用。请重试。',
  ],
  'Group send not confirmed.': [
    'Group send not confirmed.',
    '群组发送未确认。',
  ],
  'Send interrupted.': ['Send interrupted.', '发送已中断。'],
  'Sent media.': ['Sent media.', '发送了媒体。'],
  'DM key epoch unavailable.': [
    'DM key epoch unavailable.',
    '私信密钥周期不可用。',
  ],
  'Key epoch unavailable.': ['Key epoch unavailable.', '密钥周期不可用。'],
  'Invalid upload epoch.': ['Invalid upload epoch.', '上传周期无效。'],
  Balanced: ['Balanced', '均衡'],
  "Choose this account's wallet to finish signing in and open your keys.": [
    "Choose this account's wallet to finish signing in and open your keys.",
    '请选择此账户的钱包，以完成登录并打开密钥。',
  ],
  'Choose media to send.': ['Choose media to send.', '请选择要发送的媒体。'],
  'Choose no more than 256 images per round.': [
    'Choose no more than 256 images per round.',
    '每轮最多选择 256 张图片。',
  ],
  'Choose another authorized device to revoke.': [
    'Choose another authorized device to revoke.',
    '请选择另一台已授权设备以撤销授权。',
  ],
  'Choose at least one tag.': [
    'Choose at least one tag.',
    '请至少选择一个标签。',
  ],
  'Choose an approved contact.': [
    'Choose an approved contact.',
    '请选择已批准的联系人。',
  ],
  'Choose an authorized contact to send the GIF.': [
    'Choose an authorized contact to send the GIF.',
    '请选择已授权联系人以发送 GIF。',
  ],
  'Choose a status photo.': ['Choose a status photo.', '请选择状态图片。'],
  'Choose a PNG, JPEG or WebP photo no larger than 3 MB.': [
    'Choose a PNG, JPEG or WebP photo no larger than 3 MB.',
    '请选择不超过 3 MB 的 PNG、JPEG 或 WebP 图片。',
  ],
  'Choose emoji': ['Choose emoji', '选择表情'],
  'Choose whether to follow the community or author': [
    'Choose whether to follow the community or author',
    '选择关注社区或作者',
  ],
  'Choose feed': ['Choose feed', '选择动态'],
  'Choose GIF': ['Choose GIF', '选择 GIF'],
  'Scope: for example, customer support': [
    'Scope: for example, customer support',
    '授权范围：例如客户支持',
  ],
  'Write your reply…': ['Write your reply…', '写下回复…'],
  'Write a message or choose an attachment.': [
    'Write a message or choose an attachment.',
    '请撰写消息或选择附件。',
  ],
  'Write the first post': ['Write the first post', '发布第一篇帖子'],
  Dark: ['Dark', '深色'],
  'This status has expired or is not on this page.': [
    'This status has expired or is not on this page.',
    '此状态已过期，或不在此页面中。',
  ],
  'This authorization belongs to another account.': [
    'This authorization belongs to another account.',
    '此授权属于另一个账户。',
  ],
  'This account still uses the old code. Recover or migrate through the legacy flow.':
    [
      'This account still uses the old code. Recover or migrate through the legacy flow.',
      '此账户仍使用旧代码。请通过旧版流程恢复或迁移。',
    ],
  'This conversation is declined, blocked or unavailable.': [
    'This conversation is declined, blocked or unavailable.',
    '此对话已被拒绝、屏蔽或不可用。',
  ],
  'This photo could not fit the avatar. Choose another image.': [
    'This photo could not fit the avatar. Choose another image.',
    '此图片无法适配头像。请选择其他图片。',
  ],
  'This image was already uploaded with a different annotation. Use “Correct” on the saved case.':
    [
      'This image was already uploaded with a different annotation. Use “Correct” on the saved case.',
      '此图片已使用其他标注上传。请在已保存的案例中使用“修正”。',
    ],
  'This page is restricted to your account.': [
    'This page is restricted to your account.',
    '此页面仅限你的账户访问。',
  ],
  'This round expired.': ['This round expired.', '本轮已过期。'],
  'Authorization state does not match.': [
    'Authorization state does not match.',
    '授权状态不匹配。',
  ],
  'Call state does not match.': [
    'Call state does not match.',
    '通话状态不匹配。',
  ],
  'Invalid media state.': ['Invalid media state.', '媒体状态无效。'],
  'Delivery state does not match.': [
    'Delivery state does not match.',
    '送达状态不匹配。',
  ],
  'Invalid delivery state.': ['Invalid delivery state.', '送达状态无效。'],
  'Invalid message state.': ['Invalid message state.', '消息状态无效。'],
  'Invalid transfer state.': ['Invalid transfer state.', '传输状态无效。'],
  'Invalid upload state.': ['Invalid upload state.', '上传状态无效。'],
  'Invalid uploads state.': ['Invalid uploads state.', '上传状态无效。'],
  'Invalid state received from collection.': [
    'Invalid state received from collection.',
    '从采集端收到的状态无效。',
  ],
  'State is not sufficiently up to date.': [
    'State is not sufficiently up to date.',
    '状态更新不足。',
  ],
  'Invalid group states.': ['Invalid group states.', '群组状态无效。'],
  'Invalid states.': ['Invalid states.', '状态无效。'],
  'This device is already authorized.': [
    'This device is already authorized.',
    '此设备已获授权。',
  ],
  'This file is no longer linked to an available post. The analysis record remains below.':
    [
      'This file is no longer linked to an available post. The analysis record remains below.',
      '此文件已不再关联可用帖子。分析记录仍列于下方。',
    ],
  'This block is not on the device yet. Reconnect to load it.': [
    'This block is not on the device yet. Reconnect to load it.',
    '此数据块尚不在设备上。请重新联网以加载。',
  ],
  'This card was forwarded. It does not prove that the sender is the representative.':
    [
      'This card was forwarded. It does not prove that the sender is the representative.',
      '此卡片经过转发，不能证明发送者就是代表本人。',
    ],
  'This invitation is no longer available.': [
    'This invitation is no longer available.',
    '此邀请已不可用。',
  ],
  'This linking link is invalid. Generate another QR code.': [
    'This linking link is invalid. Generate another QR code.',
    '此关联链接无效。请生成新的二维码。',
  ],
  'This browser lacks the required cross-tab locking. Use an updated browser.':
    [
      'This browser lacks the required cross-tab locking. Use an updated browser.',
      '此浏览器不支持所需的标签页间互斥机制。请使用新版浏览器。',
    ],
  'This browser does not support Web Push. On iPhone/iPad, add the app to the home screen and open its icon.':
    [
      'This browser does not support Web Push. On iPhone/iPad, add the app to the home screen and open its icon.',
      '此浏览器不支持网页推送。请在 iPhone/iPad 上将应用添加到主屏幕，并通过图标打开。',
    ],
  'This browser cannot make voice calls. Open over HTTPS and allow microphone access.':
    [
      'This browser cannot make voice calls. Open over HTTPS and allow microphone access.',
      '此浏览器无法进行语音通话。请通过 HTTPS 打开并允许麦克风权限。',
    ],
  'This browser cannot read the saved theme. Using Black for this visit.': [
    'This browser cannot read the saved theme. Using Black for this visit.',
    '此浏览器无法读取已保存主题。本次使用黑色主题。',
  ],
  'This QR code does not contain a 0xDMme invitation.': [
    'This QR code does not contain a 0xDMme invitation.',
    '此二维码不包含 0xDMme 邀请。',
  ],
  'This QR code does not match the device linking step.': [
    'This QR code does not match the device linking step.',
    '此二维码与设备关联步骤不匹配。',
  ],
  'This record uses an earlier policy version. The review follows the current public rules.':
    [
      'This record uses an earlier policy version. The review follows the current public rules.',
      '此记录使用旧版政策。复核将按照现行公开规则进行。',
    ],
  'This status expired.': ['This status expired.', '此状态已过期。'],
  'This user is blocked. Their posts and replies are hidden from you.': [
    'This user is blocked. Their posts and replies are hidden from you.',
    '此用户已被屏蔽。其帖子和回复对你隐藏。',
  ],
  'Estimated unique browsers per post, including visitors who are not signed in.':
    [
      'Estimated unique browsers per post, including visitors who are not signed in.',
      '每篇帖子的独立浏览器估算数，包括未登录访客。',
    ],
  'Event belongs to another group.': [
    'Event belongs to another group.',
    '事件属于另一个群组。',
  ],
  Delete: ['Delete', '删除'],
  'Delete this badge definition when it has no assignments': [
    'Delete this badge definition when it has no assignments',
    '在没有分配记录时删除此徽章定义',
  ],
  'Delete badge': ['Delete badge', '删除徽章'],
  'Delete this status?': ['Delete this status?', '删除此状态？'],
  'Delete my post': ['Delete my post', '删除我的帖子'],
  'Delete the group and start removing the remote vault for everyone? Copies already kept by participants remain under their control.':
    [
      'Delete the group and start removing the remote vault for everyone? Copies already kept by participants remain under their control.',
      '删除群组并开始为所有成员移除远程保险库？成员已保留的副本仍由他们控制。',
    ],
  'Delete post': ['Delete post', '删除帖子'],
  'Delete text and media from active database/storage. External copies and backups may remain.':
    [
      'Delete text and media from active database/storage. External copies and backups may remain.',
      '从活动数据库和存储中删除文字及媒体。外部副本和备份可能仍然存在。',
    ],
  'Deletion differs from the already authenticated message.': [
    'Deletion differs from the already authenticated message.',
    '删除内容与已验证的消息不一致。',
  ],
  'Unauthenticated deletion.': [
    'Unauthenticated deletion.',
    '删除未经身份验证。',
  ],
  'Invalid status expiration.': [
    'Invalid status expiration.',
    '状态到期时间无效。',
  ],
  Expired: ['Expired', '已过期'],
  'Explain why this file follows the public rules': [
    'Explain why this file follows the public rules',
    '说明此文件为何符合公开规则',
  ],
  Export: ['Export', '导出'],
  'Invalid export.': ['Invalid export.', '导出无效。'],
  'Export requested. The downloaded file contains the images and is under your control.':
    [
      'Export requested. The downloaded file contains the images and is under your control.',
      '已请求导出。下载的文件包含图片，由你自行控制。',
    ],
  'Call endpoint missing.': ['Call endpoint missing.', '缺少通话端点。'],
  'Call endpoints do not match.': [
    'Call endpoints do not match.',
    '通话端点不匹配。',
  ],
  'Failed to end the local transaction.': [
    'Failed to end the local transaction.',
    '无法结束本地事务。',
  ],
  'Invalid backup failure.': ['Invalid backup failure.', '备份失败信息无效。'],
  'Failure in {0} ({1}). Check the keys and session; no plaintext will be sent.':
    [
      'Failure in {0} ({1}). Check the keys and session; no plaintext will be sent.',
      '{0} 失败（{1}）。请检查密钥和会话；不会以明文发送。',
    ],
  'Failed to communicate with the service.': [
    'Failed to communicate with the service.',
    '与服务通信失败。',
  ],
  'Invalid favorite.': ['Invalid favorite.', '收藏项无效。'],
  Close: ['Close', '关闭'],
  'Close audio': ['Close audio', '关闭音频'],
  'Close notice': ['Close notice', '关闭提示'],
  'Close original': ['Close original', '关闭原图'],
  Feed: ['Feed', '动态'],
  'Following feed': ['Following feed', '关注动态'],
  'Feed unavailable.': ['Feed unavailable.', '动态不可用。'],
  'Filter activity': ['Filter activity', '筛选活动'],
  'Filter by tag': ['Filter by tag', '按标签筛选'],
  Pin: ['Pin', '置顶'],
  'Invalid public media format.': [
    'Invalid public media format.',
    '公开媒体格式无效。',
  ],
  'Unsupported backup format.': [
    'Unsupported backup format.',
    '不支持此备份格式。',
  ],
  'Invalid test format.': ['Invalid test format.', '测试格式无效。'],
  Photo: ['Photo', '图片'],
  'Photo not yet preserved.': ['Photo not yet preserved.', '图片尚未保留。'],
  'Community photo': ['Community photo', '社区图片'],
  'The source photo must be no larger than 20 MB for local processing.': [
    'The source photo must be no larger than 20 MB for local processing.',
    '用于本地处理的原始图片不得超过 20 MB。',
  ],
  'Invalid profile photo.': ['Invalid profile photo.', '个人资料图片无效。'],
  'The photo must be no larger than 3 MB.': [
    'The photo must be no larger than 3 MB.',
    '图片不得超过 3 MB。',
  ],
  'Invalid group description.': [
    'Invalid group description.',
    '群组简介无效。',
  ],
  'Preparing photo…': ['Preparing photo…', '正在准备图片…'],
  'Group creation closed.': ['Group creation closed.', '群组创建窗口已关闭。'],
  'No description yet.': ['No description yet.', '暂无简介。'],
  'Only the owner or administrator can change the description.': [
    'Only the owner or administrator can change the description.',
    '只有群主或管理员可以更改简介。',
  ],
  'Group profile request repeated with different content.': [
    'Group profile request repeated with different content.',
    '重复的群组资料请求包含不同内容。',
  ],
  'Refresh the group before changing its profile.': [
    'Refresh the group before changing its profile.',
    '更改资料前请刷新群组。',
  ],
  'Group description changed. Reload before editing.': [
    'Group description changed. Reload before editing.',
    '群组简介已更改。编辑前请重新加载。',
  ],
  'Resume creation with the same name, description and photo or discard the pending request.':
    [
      'Resume creation with the same name, description and photo or discard the pending request.',
      '请使用相同的名称、简介和图片继续创建，或丢弃待处理请求。',
    ],
  'Group photo': ['Group photo', '群组图片'],
  'Group photo unavailable on this device.': [
    'Group photo unavailable on this device.',
    '此设备上的群组图片不可用。',
  ],
  'Profile photo': ['Profile photo', '个人资料图片'],
  'Status photo': ['Status photo', '状态图片'],
  'Photo incomplete or tampered with.': [
    'Photo incomplete or tampered with.',
    '图片不完整或遭到篡改。',
  ],
  'Photo unavailable.': ['Photo unavailable.', '图片不可用。'],
  'Invalid photo.': ['Invalid photo.', '图片无效。'],
  'Photo not confirmed. Try again.': [
    'Photo not confirmed. Try again.',
    '图片未确认。请重试。',
  ],
  'Could not save the photo. Select it again to retry.': [
    'Could not save the photo. Select it again to retry.',
    '无法保存照片。请重新选择照片后重试。',
  ],
  'Private photo unavailable on this device.': [
    'Private photo unavailable on this device.',
    '此设备上的私密图片不可用。',
  ],
  'Approved public photo': ['Approved public photo', '已批准公开的图片'],
  'Public photo unavailable.': [
    'Public photo unavailable.',
    '公开图片不可用。',
  ],
  'Photo/file': ['Photo/file', '图片/文件'],
  'Unsupported microphone sample rate.': [
    'Unsupported microphone sample rate.',
    '不支持此麦克风采样率。',
  ],
  'Role and scope': ['Role and scope', '角色与授权范围'],
  'Light background': ['Light background', '浅色背景'],
  'Gallery unavailable.': ['Gallery unavailable.', '图库不可用。'],
  General: ['General', '常规'],
  'Generating proof with a fictional identity and local artifacts…': [
    'Generating proof with a fictional identity and local artifacts…',
    '正在使用虚构身份和本地文件生成证明…',
  ],
  'Generate and sign code': ['Generate and sign code', '生成并签署代码'],
  'Manage community': ['Manage community', '管理社区'],
  'The GIF must be no larger than 3 MB.': [
    'The GIF must be no larger than 3 MB.',
    'GIF 不得超过 3 MB。',
  ],
  'GIF currently unavailable.': [
    'GIF currently unavailable.',
    'GIF 暂时不可用。',
  ],
  'Invalid GIF.': ['Invalid GIF.', 'GIF 无效。'],
  'Approved public GIF': ['Approved public GIF', '已批准公开的 GIF'],
  'GIF: {0}': ['GIF: {0}', 'GIF：{0}'],
  'GIFs from KLIPY': ['GIFs from KLIPY', '来自 KLIPY 的 GIF'],
  'GIFs and external videos connect you to providers, who receive your IP and may collect searches, browser data, cookies and playback data. Conversations remain encrypted; the app does not send them your wallet, keys or conversation history.':
    [
      'GIFs and external videos connect you to providers, who receive your IP and may collect searches, browser data, cookies and playback data. Conversations remain encrypted; the app does not send them your wallet, keys or conversation history.',
      'GIF 和外部视频会连接到服务提供商，他们会接收你的 IP，并可能收集搜索内容、浏览器数据、Cookie 及播放数据。对话仍保持加密；应用不会向他们发送钱包信息、密钥或对话历史。',
    ],
  'GIFs unavailable on this server.': [
    'GIFs unavailable on this server.',
    '此服务器上的 GIF 不可用。',
  ],
  'GIFs unavailable.': ['GIFs unavailable.', 'GIF 不可用。'],
  'Recording cancelled. No audio sent.': [
    'Recording cancelled. No audio sent.',
    '录音已取消。未发送任何音频。',
  ],
  'Recording complete; check the preview before sending.': [
    'Recording complete; check the preview before sending.',
    '录音已完成；发送前请检查预览。',
  ],
  'Message storage on the device was not confirmed.': [
    'Message storage on the device was not confirmed.',
    '设备上的消息保存未确认。',
  ],
  'Part storage not confirmed.': [
    'Part storage not confirmed.',
    '分片保存未确认。',
  ],
  'Voice recording unavailable in this browser. Use an updated browser over HTTPS.':
    [
      'Voice recording unavailable in this browser. Use an updated browser over HTTPS.',
      '此浏览器无法录制语音。请通过 HTTPS 使用新版浏览器。',
    ],
  'Recording not started: {0}': [
    'Recording not started: {0}',
    '录音未开始：{0}',
  ],
  'Recording not started. Check microphone permission.': [
    'Recording not started. Check microphone permission.',
    '录音未开始。请检查麦克风权限。',
  ],
  'Recording empty or longer than 90 seconds.': [
    'Recording empty or longer than 90 seconds.',
    '录音为空或超过 90 秒。',
  ],
  'Recording. Up to 90 seconds.': [
    'Recording. Up to 90 seconds.',
    '正在录音。最长 90 秒。',
  ],
  'group-media:{0} unavailable': [
    'group-media:{0} unavailable',
    'group-media:{0} 不可用',
  ],
  'group-message:{0} unavailable': [
    'group-message:{0} unavailable',
    'group-message:{0} 不可用',
  ],
  'Group {0}': ['Group {0}', '群组 {0}'],
  'Group opened.': ['Group opened.', '群组已打开。'],
  'Group created. Name or sync pending: {0}': [
    'Group created. Name or sync pending: {0}',
    '群组已创建。名称或同步待完成：{0}',
  ],
  'Search group changed. Start again.': [
    'Search group changed. Start again.',
    '搜索中的群组已更改。请重新开始。',
  ],
  'Invalid historical group.': ['Invalid historical group.', '历史群组无效。'],
  'Group has no origin.': ['Group has no origin.', '群组缺少来源。'],
  'Group has no current membership or content.': [
    'Group has no current membership or content.',
    '群组缺少当前成员身份或内容。',
  ],
  'Synthetic group incomplete.': [
    'Synthetic group incomplete.',
    '模拟群组不完整。',
  ],
  'Save report': ['Save report', '保存举报'],
  '{0} d ago': ['{0} d ago', '{0} 天前'],
  '{0} h ago': ['{0} h ago', '{0} 小时前'],
  '{0} min ago': ['{0} min ago', '{0} 分钟前'],
  'Invitation conflicts found. Revoke the link and resolve versions in the vault.':
    [
      'Invitation conflicts found. Revoke the link and resolve versions in the vault.',
      '发现邀请冲突。请撤销链接并解决保险库中的版本冲突。',
    ],
  'Your devices have different choices. Deletions were combined; check and save the list to resolve.':
    [
      'Your devices have different choices. Deletions were combined; check and save the list to resolve.',
      '设备间的选项不一致。删除记录已合并；请检查并保存列表以解决冲突。',
    ],
  'More history is available. Continue searching.': [
    'More history is available. Continue searching.',
    '还有更多历史可查询。请继续搜索。',
  ],
  'Media pending. Send or cancel it before choosing more.': [
    'Media pending. Send or cancel it before choosing more.',
    '有待发送媒体。请选择更多媒体前先发送或取消。',
  ],
  'A send is pending with different text. Resume the original text before sending a change.':
    [
      'A send is pending with different text. Resume the original text before sending a change.',
      '有包含不同文字的待发送内容。发送更改前，请先恢复原始文字。',
    ],
  'An encrypted draft exists. Resume or discard it first.': [
    'An encrypted draft exists. Resume or discard it first.',
    '已有加密草稿。请先恢复或丢弃。',
  ],
  'Account opening is pending in your wallet. In Profile → Devices, complete or cancel the request before updating.':
    [
      'Account opening is pending in your wallet. In Profile → Devices, complete or cancel the request before updating.',
      '钱包中有待完成的账户打开请求。更新前，请在“个人资料 → 设备”中完成或取消请求。',
    ],
  'Image hash differs from the case.': [
    'Image hash differs from the case.',
    '图片哈希与案例不一致。',
  ],
  '0xDMme · {0}': ['0xDMme · {0}', '0xDMme · {0}'],
  'Old group history.': ['Old group history.', '群组历史已过时。'],
  'History contains duplicate identifiers.': [
    'History contains duplicate identifiers.',
    '历史包含重复标识。',
  ],
  'Invalid DM identity history.': [
    'Invalid DM identity history.',
    '私信身份历史无效。',
  ],
  'DM history differs from the authenticated copy.': [
    'DM history differs from the authenticated copy.',
    '私信历史与已验证副本不一致。',
  ],
  'DM history on this device': [
    'DM history on this device',
    '此设备上的私信历史',
  ],
  'DM history exceeds the backup record budget.': [
    'DM history exceeds the backup record budget.',
    '私信历史超过备份记录预算。',
  ],
  'Invalid group history.': ['Invalid group history.', '群组历史无效。'],
  'DM identity history incomplete.': [
    'DM identity history incomplete.',
    '私信身份历史不完整。',
  ],
  'History differs from the remote copy.': [
    'History differs from the remote copy.',
    '历史与远程副本不一致。',
  ],
  'Group history does not match.': [
    'Group history does not match.',
    '群组历史不匹配。',
  ],
  'Group history incomplete.': [
    'Group history incomplete.',
    '群组历史不完整。',
  ],
  'History is still forming; growth cannot yet be compared.': [
    'History is still forming; growth cannot yet be compared.',
    '历史数据仍在积累，增长尚不可比较。',
  ],
  'History exceeds the test limit.': [
    'History exceeds the test limit.',
    '历史超过测试限制。',
  ],
  'Histórico local': ['Local history', '本地历史'],
  'Invalid local group history.': [
    'Invalid local group history.',
    '群组本地历史无效。',
  ],
  'Local history belongs to another group.': [
    'Local history belongs to another group.',
    '本地历史属于另一个群组。',
  ],
  'Local history unavailable.': [
    'Local history unavailable.',
    '本地历史不可用。',
  ],
  'Local history not authorized.': [
    'Local history not authorized.',
    '本地历史未获授权。',
  ],
  'Local history was not saved. Check available device space; the backup file remains independent.':
    [
      'Local history was not saved. Check available device space; the backup file remains independent.',
      '本地历史未保存。请检查设备可用空间；备份文件仍为独立副本。',
    ],
  'Public history belongs to another context.': [
    'Public history belongs to another context.',
    '公开历史属于其他上下文。',
  ],
  'History recovered locally in {0} ms (revision {1}). No session or device permission was restored.':
    [
      'History recovered locally in {0} ms (revision {1}). No session or device permission was restored.',
      '历史已在本地恢复，耗时 {0} 毫秒（修订版本 {1}）。未恢复任何会话或设备权限。',
    ],
  'HTTP {0}': ['HTTP {0}', 'HTTP {0}'],
  'Identity created in another tab.': [
    'Identity created in another tab.',
    '身份已在另一个标签页创建。',
  ],
  'Call identity changed.': ['Call identity changed.', '通话身份已更改。'],
  'Message identity differs from the index.': [
    'Message identity differs from the index.',
    '消息身份与索引不一致。',
  ],
  'Contact identity missing.': [
    'Contact identity missing.',
    '缺少联系人身份。',
  ],
  'Contact identity does not match.': [
    'Contact identity does not match.',
    '联系人身份不匹配。',
  ],
  "The contact's identity changed. Check with them before continuing.": [
    "The contact's identity changed. Check with them before continuing.",
    '联系人身份已更改。请先与对方核对再继续。',
  ],
  'Recipient identity missing.': [
    'Recipient identity missing.',
    '缺少接收者身份。',
  ],
  'Historical DM identity differs from the trusted copy.': [
    'Historical DM identity differs from the trusted copy.',
    '历史私信身份与可信副本不一致。',
  ],
  'Initial identity missing.': ['Initial identity missing.', '缺少初始身份。'],
  'Invalid identity.': ['Invalid identity.', '身份无效。'],
  'Local identity changed.': ['Local identity changed.', '本地身份已更改。'],
  'Local identity missing.': ['Local identity missing.', '缺少本地身份。'],
  'Source Matrix identity missing.': [
    'Source Matrix identity missing.',
    '缺少来源 Matrix 身份。',
  ],
  'Matrix identity not prepared.': [
    'Matrix identity not prepared.',
    'Matrix 身份尚未准备好。',
  ],
  'Pinned identities conflict.': [
    'Pinned identities conflict.',
    '固定身份存在冲突。',
  ],
  'Identifier confirmed with different content. Draft preserved.': [
    'Identifier confirmed with different content. Draft preserved.',
    '标识已确认，但内容不一致。草稿已保留。',
  ],
  'Invalid analysis identifier.': [
    'Invalid analysis identifier.',
    '分析标识无效。',
  ],
  'Image {0} saved: {1}.': ['Image {0} saved: {1}.', '图片 {0} 已保存：{1}。'],
  'Enlarged image': ['Enlarged image', '放大的图片'],
  'Image differs from the case.': [
    'Image differs from the case.',
    '图片与案例不一致。',
  ],
  "Image exceeds the reader's budget.": [
    "Image exceeds the reader's budget.",
    '图片超过读取器预算。',
  ],
  'Image unavailable.': ['Image unavailable.', '图片不可用。'],
  'Image unavailable. Connect or tap to try again.': [
    'Image unavailable. Connect or tap to try again.',
    '图片不可用。请联网或点击重试。',
  ],
  'Invalid image.': ['Invalid image.', '图片无效。'],
  'Original image for case {0}': [
    'Original image for case {0}',
    '案例 {0} 的原始图片',
  ],
  'Round images and results deleted from the evaluator.': [
    'Round images and results deleted from the evaluator.',
    '本轮图片和结果已从评估器中删除。',
  ],
  'Import or create a fictional package first.': [
    'Import or create a fictional package first.',
    '请先导入或创建虚构数据包。',
  ],
  'Uncertain / review': ['Uncertain / review', '不确定 / 复核'],
  'Explicit content detected': ['Explicit content detected', '检测到露骨内容'],
  'Invalid message index.': ['Invalid message index.', '消息索引无效。'],
  'Message index partially verified. Continue syncing; history remains hidden.':
    [
      'Message index partially verified. Continue syncing; history remains hidden.',
      '消息索引已部分核验。请继续同步；历史仍保持隐藏。',
    ],
  'Historical index differs from encrypted content.': [
    'Historical index differs from encrypted content.',
    '历史索引与加密内容不一致。',
  ],
  'Historical index not authenticated.': [
    'Historical index not authenticated.',
    '历史索引未经验证。',
  ],
  'Local index belongs to another group.': [
    'Local index belongs to another group.',
    '本地索引属于另一个群组。',
  ],
  'Local index partially loaded. Continue opening the local copy.': [
    'Local index partially loaded. Continue opening the local copy.',
    '本地索引已部分加载。请继续打开本地副本。',
  ],
  unavailable: ['unavailable', '不可用'],
  'Cryptographic information missing.': [
    'Cryptographic information missing.',
    '缺少加密信息。',
  ],
  'Enter a valid invitation.': [
    'Enter a valid invitation.',
    '请输入有效邀请。',
  ],
  'Enter the old code one last time to authorize migration.': [
    'Enter the old code one last time to authorize migration.',
    '请最后一次输入旧代码，以授权迁移。',
  ],
  'cryptographic engine initialization': [
    'cryptographic engine initialization',
    '加密引擎初始化',
  ],
  'Installation and offline mode require a compatible browser and HTTPS or loopback.':
    [
      'Installation and offline mode require a compatible browser and HTTPS or loopback.',
      '安装和离线模式需要兼容浏览器，以及 HTTPS 或回环地址。',
    ],
  'Interface missing.': ['Interface missing.', '缺少界面。'],
  'Test interface missing.': ['Test interface missing.', '缺少测试界面。'],
  'Interface incomplete.': ['Interface incomplete.', '界面不完整。'],
  'Offline interface unavailable. Try again with a connection.': [
    'Offline interface unavailable. Try again with a connection.',
    '离线界面不可用。请联网后重试。',
  ],
  'This page already runs the latest version.': [
    'This page already runs the latest version.',
    '此页面已在使用最新版本。',
  ],
  'Public interface installed for offline use.': [
    'Public interface installed for offline use.',
    '公开界面已安装，可离线使用。',
  ],
  'Corrupted item.': ['Corrupted item.', '项目已损坏。'],
  'Backup item missing.': ['Backup item missing.', '缺少备份项目。'],
  'Item differs from the report.': [
    'Item differs from the report.',
    '项目与报告不一致。',
  ],
  'Item exceeds the limit.': ['Item exceeds the limit.', '项目超过限制。'],
  'A connection request is already pending in your wallet.': [
    'A connection request is already pending in your wallet.',
    '钱包中已有待处理连接请求。',
  ],
  'Verified window exceeds the limit.': [
    'Verified window exceeds the limit.',
    '已验证窗口超过限制。',
  ],
  'Generated JPEG incomplete.': [
    'Generated JPEG incomplete.',
    '生成的 JPEG 不完整。',
  ],
  'Generated JPEG invalid.': ['Generated JPEG invalid.', '生成的 JPEG 无效。'],
  'Reader unavailable.': ['Reader unavailable.', '读取器不可用。'],
  'Mention read unavailable.': [
    'Mention read unavailable.',
    '提及读取不可用。',
  ],
  'Reading stopped after one minute. Try again.': [
    'Reading stopped after one minute. Try again.',
    '读取已在一分钟后停止。请重试。',
  ],
  'Public reading · account required to participate': [
    'Public reading · account required to participate',
    '公开阅读 · 参与需要账户',
  ],
  'Public reading cancelled.': [
    'Public reading cancelled.',
    '公开读取已取消。',
  ],
  'Public reading unavailable.': [
    'Public reading unavailable.',
    '公开读取不可用。',
  ],
  'Public readers busy.': ['Public readers busy.', '公开读取服务繁忙。'],
  'Reading and validating the selected file.': [
    'Reading and validating the selected file.',
    '正在读取并验证所选文件。',
  ],
  'Read by recipient': ['Read by recipient', '接收者已读'],
  '45-second limit reached; workers stopped. Record this result in the device test.':
    [
      '45-second limit reached; workers stopped. Record this result in the device test.',
      '已达到 45 秒上限；工作线程已停止。请在设备测试中记录此结果。',
    ],
  '90-second limit reached. Check the preview before sending.': [
    '90-second limit reached. Check the preview before sending.',
    '已达到 90 秒上限。发送前请检查预览。',
  ],
  'Recording limit reached. Check the preserved excerpt.': [
    'Recording limit reached. Check the preserved excerpt.',
    '已达到录音上限。请检查保留的片段。',
  ],
  'Test key package limit reached.': [
    'Test key package limit reached.',
    '已达到测试密钥包上限。',
  ],
  Clear: ['Clear', '清除'],
  "Clear this group's remote vault content? Messages and media will be removed; local copies and saved files may remain.":
    [
      "Clear this group's remote vault content? Messages and media will be removed; local copies and saved files may remain.",
      '清理此群组的远程保险库内容？消息和媒体将被移除；本地副本及已保存文件可能仍然保留。',
    ],
  'Old media cleanup scheduled for {0}. About {1} MB selected. Text stays.': [
    'Old media cleanup scheduled for {0}. About {1} MB selected. Text stays.',
    '旧媒体计划于 {0} 清理。已选择约 {1} MB。文字会保留。',
  ],
  'Temporary backup file cleanup pending.': [
    'Temporary backup file cleanup pending.',
    '临时备份文件清理待完成。',
  ],
  'Vault cleanup started.': ['Vault cleanup started.', '保险库清理已开始。'],
  'Link copied.': ['Link copied.', '链接已复制。'],
  'Link copied. Share it manually with the recipient.': [
    'Link copied. Share it manually with the recipient.',
    '链接已复制。请手动分享给接收者。',
  ],
  'Invalid community link.': ['Invalid community link.', '社区链接无效。'],
  'Link not confirmed.': ['Link not confirmed.', '链接未确认。'],
  'Private invitation link': ['Private invitation link', '私密邀请链接'],
  'Link ready. Copy the address above.': [
    'Link ready. Copy the address above.',
    '链接已准备好。请复制上方地址。',
  ],
  'Link revoked. Existing members remain in the group.': [
    'Link revoked. Existing members remain in the group.',
    '链接已撤销。已加入的成员仍在群组中。',
  ],
  'Invalid contact list.': ['Invalid contact list.', '联系人列表无效。'],
  'Invalid group list.': ['Invalid group list.', '群组列表无效。'],
  'Invalid status list.': ['Invalid status list.', '状态列表无效。'],
  'List unavailable.': ['List unavailable.', '列表不可用。'],
  'Follower lists': ['Follower lists', '关注者列表'],
  'Community lists and management': [
    'Community lists and management',
    '社区列表与管理',
  ],
  'Sign in with wallet or device linking': [
    'Sign in with wallet or device linking',
    '通过钱包或设备关联登录',
  ],
  'Backup batch exceeds the limit.': [
    'Backup batch exceeds the limit.',
    '备份批次超过限制。',
  ],
  'Invalid backup batch.': ['Invalid backup batch.', '备份批次无效。'],
  Largest: ['Largest', '最大社区'],
  'More authorizations': ['More authorizations', '更多授权'],
  'Most discussed': ['Most discussed', '最多评论'],
  'More communities': ['More communities', '更多社区'],
  'More contacts': ['More contacts', '更多联系人'],
  'More conversations': ['More conversations', '更多对话'],
  'More local copies': ['More local copies', '更多本地副本'],
  'More filters': ['More filters', '更多筛选'],
  'More moderators': ['More moderators', '更多管理员'],
  'More options': ['More options', '更多选项'],
  'More post options': ['More post options', '更多帖子选项'],
  'More organizations and authorizations': [
    'More organizations and authorizations',
    '更多组织与授权',
  ],
  'More tags': ['More tags', '更多标签'],
  'Top voted': ['Top voted', '最高票'],
  'Manifest belongs to another account.': [
    'Manifest belongs to another account.',
    '清单属于另一个账户。',
  ],
  'Inconsistent manifest.': ['Inconsistent manifest.', '清单不一致。'],
  'Manifest references an unknown authority.': [
    'Manifest references an unknown authority.',
    '清单引用了未知授权方。',
  ],
  'Keep removal and respond': [
    'Keep removal and respond',
    '保留移除决定并回复',
  ],
  'Keep sanction and respond': ['Keep sanction and respond', '保留处罚并回复'],
  'Keep links only': ['Keep links only', '仅保留链接'],
  'Annotation corrected.': ['Annotation corrected.', '标注已修正。'],
  'Invalid annotation received from collection.': [
    'Invalid annotation received from collection.',
    '从采集端收到的标注无效。',
  ],
  'Annotate each image. Each click saves the original and advances.': [
    'Annotate each image. Each click saves the original and advances.',
    '请逐张标注图片。每次点击都会保存原始文件并继续下一张。',
  ],
  'Annotate at least one image before finishing.': [
    'Annotate at least one image before finishing.',
    '完成前请至少标注一张图片。',
  ],
  Medium: ['Medium', '中等'],
  'Medium light': ['Medium light', '中浅色'],
  'Medium dark': ['Medium dark', '中深色'],
  'media:{0} {1}': ['media:{0} {1}', 'media:{0} {1}'],
  Member: ['Member', '成员'],
  'Member {0}': ['Member {0}', '成员 {0}'],
  Mentions: ['Mentions', '提及'],
  'Mentions of you': ['Mentions of you', '提及你的内容'],
  Message: ['Message', '消息'],
  'Message {0} · {1} MB': ['Message {0} · {1} MB', '消息 {0} · {1} MB'],
  'Message missing.': ['Message missing.', '缺少消息。'],
  'DM tampered with or from another context.': [
    'DM tampered with or from another context.',
    '私信遭到篡改或属于其他上下文。',
  ],
  'Voice message · {0}': ['Voice message · {0}', '语音消息 · {0}'],
  'Voice message playing': ['Voice message playing', '正在播放语音消息'],
  'Message differs from validated history.': [
    'Message differs from validated history.',
    '消息与已验证历史不一致。',
  ],
  'Message differs from group index.': [
    'Message differs from group index.',
    '消息与群组索引不一致。',
  ],
  'Message differs from index.': [
    'Message differs from index.',
    '消息与索引不一致。',
  ],
  'Group message changed.': ['Group message changed.', '群组消息已更改。'],
  'Message sent by you': ['Message sent by you', '你发送的消息'],
  'Message sent.': ['Message sent.', '消息已发送。'],
  'Message outside the authorized account.': [
    'Message outside the authorized account.',
    '消息不属于已授权账户。',
  ],
  'Message outside your membership period.': [
    'Message outside your membership period.',
    '消息不在你的成员有效期内。',
  ],
  'Invalid historical group message.': [
    'Invalid historical group message.',
    '群组历史消息无效。',
  ],
  'Historical message belongs to another DM.': [
    'Historical message belongs to another DM.',
    '历史消息属于另一条私信。',
  ],
  'Invalid historical message.': [
    'Invalid historical message.',
    '历史消息无效。',
  ],
  'Message unavailable under current authorization.': [
    'Message unavailable under current authorization.',
    '当前授权无法访问此消息。',
  ],
  'Message unavailable.': ['Message unavailable.', '消息不可用。'],
  'Message via @': ['Message via @', '通过 @ 发送消息'],
  'Message received from {0}': ['Message received from {0}', '来自 {0} 的消息'],
  'Message received from @{0}': [
    'Message received from @{0}',
    '来自 @{0} 的消息',
  ],
  'Message rejected: invalid key, authorship or integrity.': [
    'Message rejected: invalid key, authorship or integrity.',
    '消息被拒绝：密钥、作者身份或完整性无效。',
  ],
  'Message has no media.': ['Message has no media.', '消息不含媒体。'],
  'Message has no verified membership or origin.': [
    'Message has no verified membership or origin.',
    '消息缺少已验证的成员身份或来源。',
  ],
  'Message has no recovery for your account.': [
    'Message has no recovery for your account.',
    '消息缺少适用于你账户的恢复信息。',
  ],
  'Handle messages': ['Handle messages', '用户名私信'],
  'Messages opened. Personal vault full: the read could not be recorded.': [
    'Messages opened. Personal vault full: the read could not be recorded.',
    '消息已打开。个人保险库已满：无法记录已读状态。',
  ],
  'Invalid group messages.': ['Invalid group messages.', '群组消息无效。'],
  'Group metadata tampered with.': [
    'Group metadata tampered with.',
    '群组元数据遭到篡改。',
  ],
  'My device': ['My device', '我的设备'],
  'My posts': ['My posts', '我的帖子'],
  'Microphone stopped.': ['Microphone stopped.', '麦克风已关闭。'],
  'Microphone not authorized.': [
    'Microphone not authorized.',
    '麦克风未获授权。',
  ],
  'Media awaiting approval.': ['Media awaiting approval.', '媒体等待批准。'],
  'Media missing from the local copy.': [
    'Media missing from the local copy.',
    '本地副本中缺少媒体。',
  ],
  'Backup media tampered with.': [
    'Backup media tampered with.',
    '备份媒体遭到篡改。',
  ],
  'Invalid historical DM media.': [
    'Invalid historical DM media.',
    '历史私信媒体无效。',
  ],
  'DM media not declared.': ['DM media not declared.', '未声明私信媒体。'],
  'Empty DM media.': ['Empty DM media.', '私信媒体为空。'],
  'Invalid group media.': ['Invalid group media.', '群组媒体无效。'],
  'Post or reply media': ['Post or reply media', '帖子或回复媒体'],
  'Status media does not match.': [
    'Status media does not match.',
    '状态媒体不匹配。',
  ],
  'External media unavailable.': [
    'External media unavailable.',
    '外部媒体不可用。',
  ],
  'External media kept as a link. Change permission in Profile.': [
    'External media kept as a link. Change permission in Profile.',
    '外部媒体仅保留为链接。可在“个人资料”中更改权限。',
  ],
  'Historical media tampered with.': [
    'Historical media tampered with.',
    '历史媒体遭到篡改。',
  ],
  'Historical media does not match.': [
    'Historical media does not match.',
    '历史媒体不匹配。',
  ],
  'Invalid historical media.': ['Invalid historical media.', '历史媒体无效。'],
  'Imported media belongs to another DM.': [
    'Imported media belongs to another DM.',
    '导入的媒体属于另一条私信。',
  ],
  'Media incomplete.': ['Media incomplete.', '媒体不完整。'],
  'Media unavailable in the remote vault. A downloaded copy may remain on this device.':
    [
      'Media unavailable in the remote vault. A downloaded copy may remain on this device.',
      '远程保险库中的媒体不可用。已下载的副本可能仍保留在此设备上。',
    ],
  'Media not preserved in this local copy.': [
    'Media not preserved in this local copy.',
    '此本地副本未保留媒体。',
  ],
  'Media unavailable in imported history.': [
    'Media unavailable in imported history.',
    '导入的历史中没有此媒体。',
  ],
  'Media not allowed.': ['Media not allowed.', '不允许此媒体。'],
  'Media pending on this device. Send or remove it.': [
    'Media pending on this device. Send or remove it.',
    '此设备有待发送媒体。请发送或移除。',
  ],
  'Prepared media restricted to the author': [
    'Prepared media restricted to the author',
    '已处理媒体仅作者可见',
  ],
  'Public media exceeds the limit.': [
    'Public media exceeds the limit.',
    '公开媒体超过限制。',
  ],
  'Public media incomplete.': ['Public media incomplete.', '公开媒体不完整。'],
  'Public media unavailable.': [
    'Public media unavailable.',
    '公开媒体不可用。',
  ],
  'Restored media belongs to another group.': [
    'Restored media belongs to another group.',
    '恢复的媒体属于另一个群组。',
  ],
  'Empty media.': ['Empty media.', '媒体为空。'],
  'Processing media. Please wait.': [
    'Processing media. Please wait.',
    '正在处理媒体。请稍候。',
  ],
  'External media': ['External media', '外部媒体'],
  'External media allowed.': ['External media allowed.', '已允许外部媒体。'],
  'External media kept as links only.': [
    'External media kept as links only.',
    '外部媒体仅保留为链接。',
  ],
  'Migration requires an authorized device and old configuration.': [
    'Migration requires an authorized device and old configuration.',
    '迁移需要已授权设备及旧配置。',
  ],
  'Migration does not extend the trusted local root.': [
    'Migration does not extend the trusted local root.',
    '迁移不会延伸可信本地根。',
  ],
  'My account': ['My account', '我的账户'],
  'My authorizations': ['My authorizations', '我的授权'],
  'My communities': ['My communities', '我的社区'],
  'Thumbnail missing.': ['Thumbnail missing.', '缺少缩略图。'],
  'Thumbnail for case {0}': ['Thumbnail for case {0}', '案例 {0} 的缩略图'],
  'Thumbnail exceeds the safe limit.': [
    'Thumbnail exceeds the safe limit.',
    '缩略图超过安全限制。',
  ],
  Moderation: ['Moderation', '审核'],
  'Automated moderation': ['Automated moderation', '自动审核'],
  Moderator: ['Moderator', '管理员'],
  Moderators: ['Moderators', '管理员'],
  'Moderators currently unavailable.': [
    'Moderators currently unavailable.',
    '管理员暂时不可用。',
  ],
  'Invalid group mode.': ['Invalid group mode.', '群组模式无效。'],
  'Show GIF': ['Show GIF', '显示 GIF'],
  'Show less': ['Show less', '收起'],
  Reason: ['Reason', '原因'],
  'Report reason': ['Report reason', '举报原因'],
  'Post report reason': ['Post report reason', '帖子举报原因'],
  'Removal reason': ['Removal reason', '移除原因'],
  'Reason: {0}': ['Reason: {0}', '原因：{0}'],
  'Group change not confirmed.': [
    'Group change not confirmed.',
    '群组更改未确认。',
  ],
  'Too many simultaneous changes in this conversation. Sync, then try again.': [
    'Too many simultaneous changes in this conversation. Sync, then try again.',
    '此对话中的并发更改过多。请同步后重试。',
  ],
  'Too many preference versions. Resolve conflicts before continuing.': [
    'Too many preference versions. Resolve conflicts before continuing.',
    '偏好设置版本过多。请解决冲突后继续。',
  ],
  'Too many server requests. Wait and try again.': [
    'Too many server requests. Wait and try again.',
    '服务器请求过多。请稍候再试。',
  ],
  'in management': ['in management', '在管理设置中'],
  'in the community description': [
    'in the community description',
    '在社区简介中',
  ],
  'in the profile description': [
    'in the profile description',
    '在个人资料简介中',
  ],
  'Nothing new here.': ['Nothing new here.', '暂无新内容。'],
  'not applied.': ['not applied.', '未应用。'],
  'Not detected here': ['Not detected here', '此处未检测到'],
  'Not sent · disappears if the page reloads': [
    'Not sent · disappears if the page reloads',
    '未发送 · 刷新页面后消失',
  ],
  'Could not open the enlarged image.': [
    'Could not open the enlarged image.',
    '无法打开放大的图片。',
  ],
  'Could not open this image. Remove the file from the queue and continue.': [
    'Could not open this image. Remove the file from the queue and continue.',
    '无法打开此图片。请从队列中移除文件后继续。',
  ],
  'Could not open the group.': ['Could not open the group.', '无法打开群组。'],
  'Could not open the emoji panel.': [
    'Could not open the emoji panel.',
    '无法打开表情面板。',
  ],
  'Could not open the panel.': ['Could not open the panel.', '无法打开面板。'],
  'Could not open emoji.': ['Could not open emoji.', '无法打开表情。'],
  'Could not open pending sends on this device.': [
    'Could not open pending sends on this device.',
    '无法打开此设备的待发送内容。',
  ],
  'Could not delete the fictional package.': [
    'Could not delete the fictional package.',
    '无法删除虚构数据包。',
  ],
  'Could not enable notifications.': [
    'Could not enable notifications.',
    '无法启用通知。',
  ],
  'Could not update presence.': [
    'Could not update presence.',
    '无法更新在线状态。',
  ],
  'Could not update presence. Online status will stop after the activity timeout.':
    [
      'Could not update presence. Online status will stop after the activity timeout.',
      '无法更新在线状态。活动时限结束后，将不再显示在线。',
    ],
  'Could not search. Keep typing to try again.': [
    'Could not search. Keep typing to try again.',
    '无法搜索。继续输入即可重试。',
  ],
  'Could not search. Try again.': [
    'Could not search. Try again.',
    '无法搜索。请重试。',
  ],
  'Could not load sound preferences. The current choice applies for this visit.':
    [
      'Could not load sound preferences. The current choice applies for this visit.',
      '无法加载声音设置。当前选项仅适用于本次访问。',
    ],
  'Could not load audio. Tap to try again.': [
    'Could not load audio. Tap to try again.',
    '无法加载音频。点击重试。',
  ],
  'Could not load preferences.': [
    'Could not load preferences.',
    '无法加载偏好设置。',
  ],
  'Could not load.': ['Could not load.', '无法加载。'],
  'Could not safely complete analysis. Content will not be public until approved.':
    [
      'Could not safely complete analysis. Content will not be public until approved.',
      '无法安全完成分析。在获批前，内容不会公开。',
    ],
  'Could not complete analysis. The file remains restricted.': [
    'Could not complete analysis. The file remains restricted.',
    '无法完成分析。文件仍受限制。',
  ],
  'Could not complete authorization.': [
    'Could not complete authorization.',
    '无法完成授权。',
  ],
  'Could not complete the call operation.': [
    'Could not complete the call operation.',
    '无法完成通话操作。',
  ],
  'Could not complete the group operation.': [
    'Could not complete the group operation.',
    '无法完成群组操作。',
  ],
  'Could not complete the operation.': [
    'Could not complete the operation.',
    '无法完成操作。',
  ],
  'Could not complete identity synchronization. Try again.': [
    'Could not complete identity synchronization. Try again.',
    '无法完成身份同步。请重试。',
  ],
  'Could not complete the backup.': [
    'Could not complete the backup.',
    '无法完成备份。',
  ],
  'Could not complete the status.': [
    'Could not complete the status.',
    '无法完成状态操作。',
  ],
  'Could not connect to the server.': [
    'Could not connect to the server.',
    '无法连接服务器。',
  ],
  'Could not connect this device.': [
    'Could not connect this device.',
    '无法连接此设备。',
  ],
  'Could not check authorization now. The next update will try again.': [
    'Could not check authorization now. The next update will try again.',
    '暂时无法检查授权。下次更新时将重试。',
  ],
  'Could not check pending sends.': [
    'Could not check pending sends.',
    '无法检查待发送内容。',
  ],
  'Could not confirm metadata removal.': [
    'Could not confirm metadata removal.',
    '无法确认元数据已移除。',
  ],
  'Could not check storage.': [
    'Could not check storage.',
    '无法查询存储空间。',
  ],
  'Could not check the return. Check your connection and return to this screen.':
    [
      'Could not check the return. Check your connection and return to this screen.',
      '无法查询返回结果。请检查连接并返回此页面。',
    ],
  'Could not copy the wallet address.': [
    'Could not copy the wallet address.',
    '无法复制钱包地址。',
  ],
  'Could not copy the text.': ['Could not copy the text.', '无法复制文字。'],
  'Could not create the wallet-opening request. Check your connection and try again.':
    [
      'Could not create the wallet-opening request. Check your connection and try again.',
      '无法创建打开钱包的请求。请检查连接后重试。',
    ],
  'Could not stop audio in this browser.': [
    'Could not stop audio in this browser.',
    '无法停止此浏览器中的音频。',
  ],
  'Could not close the microphone context.': [
    'Could not close the microphone context.',
    '无法关闭麦克风上下文。',
  ],
  'Could not run the proof in this browser.': [
    'Could not run the proof in this browser.',
    '无法在此浏览器中运行证明。',
  ],
  'Could not display the image. You can save the original file.': [
    'Could not display the image. You can save the original file.',
    '无法显示图片。你可以保存原始文件。',
  ],
  'Could not save local access on this device.': [
    'Could not save local access on this device.',
    '无法在此设备上保存本地访问权限。',
  ],
  'Could not start the call.': ['Could not start the call.', '无法发起通话。'],
  'Could not start local attachment processing.': [
    'Could not start local attachment processing.',
    '无法启动本地附件处理。',
  ],
  'Could not read this QR code. Use the QR code for this step or copy the code.':
    [
      'Could not read this QR code. Use the QR code for this step or copy the code.',
      '无法读取此二维码。请使用此步骤的二维码，或复制代码。',
    ],
  'Could not scan with the camera. Check permission or copy the code.': [
    'Could not scan with the camera. Check permission or copy the code.',
    '无法通过摄像头扫描。请检查权限或复制代码。',
  ],
  'Could not mark as read.': ['Could not mark as read.', '无法标记为已读。'],
  'Could not optimize the photo to 3 MB.': [
    'Could not optimize the photo to 3 MB.',
    '无法将图片优化至 3 MB。',
  ],
  'Could not search.': ['Could not search.', '无法搜索。'],
  'Could not prepare the photo on this device.': [
    'Could not prepare the photo on this device.',
    '无法在此设备上处理图片。',
  ],
  'Could not prepare the recording.': [
    'Could not prepare the recording.',
    '无法准备录音。',
  ],
  'Could not prepare conversation history.': [
    'Could not prepare conversation history.',
    '无法准备对话历史。',
  ],
  'Could not process the attachment. Check its format, size, pixels and browser support.':
    [
      'Could not process the attachment. Check its format, size, pixels and browser support.',
      '无法处理附件。请检查格式、大小、像素及浏览器支持情况。',
    ],
  'Could not publish the reply.': [
    'Could not publish the reply.',
    '无法发布回复。',
  ],
  'Could not reconnect within 20 seconds.': [
    'Could not reconnect within 20 seconds.',
    '未能在 20 秒内重新连接。',
  ],
  'Could not recover the session or open the private profile. Check your connection.':
    [
      'Could not recover the session or open the private profile. Check your connection.',
      '无法恢复会话或打开私密个人资料。请检查连接。',
    ],
  'Could not record the appeal.': [
    'Could not record the appeal.',
    '无法记录申诉。',
  ],
  'Could not save settings.': ['Could not save settings.', '无法保存设置。'],
  'Could not save on this device. The theme applies until you close the app.': [
    'Could not save on this device. The theme applies until you close the app.',
    '无法保存到此设备。主题仅在关闭应用前有效。',
  ],
  'Could not save preferences.': [
    'Could not save preferences.',
    '无法保存偏好设置。',
  ],
  'Could not save; this choice applies only to this visit.': [
    'Could not save; this choice applies only to this visit.',
    '无法保存；此选项仅适用于本次访问。',
  ],
  'Could not save. Try again.': [
    'Could not save. Try again.',
    '无法保存。请重试。',
  ],
  'No authorized local copy on this device.': [
    'No authorized local copy on this device.',
    '此设备没有已授权的本地副本。',
  ],
  'No more replies available to display.': [
    'No more replies available to display.',
    '没有更多可显示的回复。',
  ],
  'not selected': ['not selected', '未选择'],
  'Reply navigation': ['Reply navigation', '回复导航'],
  'Community navigation': ['Community navigation', '社区导航'],
  'Navigation interrupted recording; the excerpt is preserved for review when returning to the conversation.':
    [
      'Navigation interrupted recording; the excerpt is preserved for review when returning to the conversation.',
      '页面切换中断了录音；片段已保留，返回对话后可检查。',
    ],
  'Navigation interrupted recording. Check the excerpt when you return.': [
    'Navigation interrupted recording. Check the excerpt when you return.',
    '页面切换中断了录音。返回后请检查片段。',
  ],
  'Negotiation outdated or from another device.': [
    'Negotiation outdated or from another device.',
    '协商已过时或来自其他设备。',
  ],
  'No audio captured. Try again.': [
    'No audio captured. Try again.',
    '未录制到音频。请重试。',
  ],
  'No blocks on this page.': [
    'No blocks on this page.',
    '此页面没有屏蔽记录。',
  ],
  'No contacts available to add.': [
    'No contacts available to add.',
    '没有可添加的联系人。',
  ],
  'No content included.': ['No content included.', '未包含任何内容。'],
  'No content on this page matches these filters.': [
    'No content on this page matches these filters.',
    '此页面没有符合筛选条件的内容。',
  ],
  'No authorized devices.': ['No authorized devices.', '没有已授权设备。'],
  'No emoji found.': ['No emoji found.', '未找到表情。'],
  'No GIFs found.': ['No GIFs found.', '未找到 GIF。'],
  'No items in this export are eligible for cleanup. Attachments must be complete in the file.':
    [
      'No items in this export are eligible for cleanup. Attachments must be complete in the file.',
      '此导出没有符合清理条件的项目。文件中的附件必须完整。',
    ],
  'No moderators.': ['No moderators.', '没有管理员。'],
  'No active package for recovery.': [
    'No active package for recovery.',
    '没有可恢复的当前数据包。',
  ],
  'No active package. Import a valid file or create a test.': [
    'No active package. Import a valid file or create a test.',
    '没有当前数据包。请导入有效文件或创建测试。',
  ],
  'No requests received. New requests appear here.': [
    'No requests received. New requests appear here.',
    '尚未收到请求。新请求会显示在这里。',
  ],
  'No declined requests on this page.': [
    'No declined requests on this page.',
    '此页面没有已拒绝请求。',
  ],
  'No profiles in this list.': [
    'No profiles in this list.',
    '此列表没有个人资料。',
  ],
  'No profiles or communities found.': [
    'No profiles or communities found.',
    '未找到个人资料或社区。',
  ],
  'No records found in these contacts.': [
    'No records found in these contacts.',
    '未在联系人中找到记录。',
  ],
  "No results in this page's items.": [
    "No results in this page's items.",
    '此页面项目中没有搜索结果。',
  ],
  'No active statuses on this page.': [
    'No active statuses on this page.',
    '此页面没有有效状态。',
  ],
  'No users or communities found.': [
    'No users or communities found.',
    '未找到用户或社区。',
  ],
  'No authorizations available on this page. Create and issue them in Profile → Organizations and representatives.':
    [
      'No authorizations available on this page. Create and issue them in Profile → Organizations and representatives.',
      '此页面没有可用授权。请在“个人资料 → 组织与代表”中创建并签发。',
    ],
  'No communities in this list.': [
    'No communities in this list.',
    '此列表没有社区。',
  ],
  'No followed communities.': ['No followed communities.', '尚未关注社区。'],
  'No handle conversations yet. Open a public profile to send a message.': [
    'No handle conversations yet. Open a public profile to send a message.',
    '尚无用户名对话。打开公开个人资料即可发送消息。',
  ],
  'No loaded conversations match the search.': [
    'No loaded conversations match the search.',
    '已加载对话中没有符合搜索条件的结果。',
  ],
  'No conversations allowed yet. Add a contact or accept a request.': [
    'No conversations allowed yet. Add a contact or accept a request.',
    '尚无获准对话。请添加联系人或接受请求。',
  ],
  'No conversations in this filter.': [
    'No conversations in this filter.',
    '此筛选条件下没有对话。',
  ],
  'No messages yet.': ['No messages yet.', '暂无消息。'],
  'No messages found.': ['No messages found.', '未找到消息。'],
  'No notifications on this page.': [
    'No notifications on this page.',
    '此页面没有通知。',
  ],
  'No posts yet': ['No posts yet', '暂无帖子'],
  'No posts in this list.': ['No posts in this list.', '此列表没有帖子。'],
  'No public publications in this tab.': [
    'No public publications in this tab.',
    '此标签页没有公开发布内容。',
  ],
  'No tags created.': ['No tags created.', '尚未创建标签。'],
  'No test wallet available.': [
    'No test wallet available.',
    '没有可用测试钱包。',
  ],
  'No wallets detected. Open this address in a browser with your test wallet; do not use an account with funds.':
    [
      'No wallets detected. Open this address in a browser with your test wallet; do not use an account with funds.',
      '未检测到钱包。请在支持测试钱包的浏览器中打开此地址；不要使用有资金的账户。',
    ],
  'On this device': ['On this device', '在此设备上'],
  Name: ['Name', '名称'],
  'Community name': ['Community name', '社区名称'],
  'New tag name': ['New tag name', '新标签名称'],
  'Organization name': ['Organization name', '组织名称'],
  'Tag name': ['Tag name', '标签名称'],
  'Group name has no authorized administrator.': [
    'Group name has no authorized administrator.',
    '群组名称缺少已授权管理员。',
  ],
  'Badge name (text or emoji)': [
    'Badge name (text or emoji)',
    '徽章名称（文字或表情）',
  ],
  'Appoint moderator': ['Appoint moderator', '任命管理员'],
  Notifications: ['Notifications', '通知'],
  'Earlier notifications': ['Earlier notifications', '更早的通知'],
  'Notifications off': ['Notifications off', '通知已关闭'],
  'Notifications on this device': [
    'Notifications on this device',
    '此设备上的通知',
  ],
  'Notifications and calls': ['Notifications and calls', '通知与通话'],
  'Notifications on': ['Notifications on', '通知已开启'],
  'Push notifications': ['Push notifications', '推送通知'],
  'New publication': ['New publication', '新发布内容'],
  'New root without a verified transition.': [
    'New root without a verified transition.',
    '新根缺少已验证的过渡。',
  ],
  'New reply to your content': [
    'New reply to your content',
    '你的内容收到新回复',
  ],
  'New version ready. Choose when to update.': [
    'New version ready. Choose when to update.',
    '新版本已就绪。你可以选择何时更新。',
  ],
  'New updates arrived during verification. Sync again.': [
    'New updates arrived during verification. Sync again.',
    '核验期间收到新更新。请重新同步。',
  ],
  'New device': ['New device', '新设备'],
  'New device linked.': ['New device linked.', '新设备已关联。'],
  'New invitation active and preserved in the vault. The previous one was invalidated.':
    [
      'New invitation active and preserved in the vault. The previous one was invalidated.',
      '新邀请已启用并保存在保险库中。先前的邀请已失效。',
    ],
  'The test file must be no larger than 4 KiB. No package is active.': [
    'The test file must be no larger than 4 KiB. No package is active.',
    '测试文件不得超过 4 KiB。没有当前数据包。',
  ],
  'The file was discarded after seven days without approval.': [
    'The file was discarded after seven days without approval.',
    '文件在七天内未获批准，已被清除。',
  ],
  'The unapproved file was discarded at the deadline.': [
    'The unapproved file was discarded at the deadline.',
    '未获批准的文件已在到期后清除。',
  ],
  'The file is not a PNG, JPEG or WebP image.': [
    'The file is not a PNG, JPEG or WebP image.',
    '此文件不是 PNG、JPEG 或 WebP 图片。',
  ],
  'The full backup includes conversations, audio, images and files.': [
    'The full backup includes conversations, audio, images and files.',
    '完整备份包含对话、音频、图片和文件。',
  ],
  'the backup in Profile → Vault and backup': [
    'the backup in Profile → Vault and backup',
    '“个人资料 → 保险库与备份”中的备份',
  ],
  'The community banner was withheld from public view': [
    'The community banner was withheld from public view',
    '社区横幅未公开展示',
  ],
  'The media path did not confirm TURN at both endpoints.': [
    'The media path did not confirm TURN at both endpoints.',
    '媒体路径未确认两个端点均使用 TURN。',
  ],
  'The received case differs from the uploaded image.': [
    'The received case differs from the uploaded image.',
    '收到的案例与上传图片不一致。',
  ],
  'The vault is still loading settings.': [
    'The vault is still loading settings.',
    '保险库仍在加载设置。',
  ],
  'Your contact must open the app to prepare recovery before the first message.':
    [
      'Your contact must open the app to prepare recovery before the first message.',
      '首次发送消息前，联系人需要打开应用以准备恢复信息。',
    ],
  'The invitation differs from your identity.': [
    'The invitation differs from your identity.',
    '邀请与你的身份不一致。',
  ],
  'The invitation no longer has an authorized administrator.': [
    'The invitation no longer has an authorized administrator.',
    '邀请已没有获授权的管理员。',
  ],
  'The recipient must open Handle messages in this app to prepare E2EE recovery.':
    [
      'The recipient must open Handle messages in this app to prepare E2EE recovery.',
      '接收者需要在此应用中打开“用户名私信”，以准备端到端加密恢复信息。',
    ],
  'The sign-in destination changed. Start again.': [
    'The sign-in destination changed. Start again.',
    '登录目标已更改。请重新开始。',
  ],
  'The test was hidden during the operation. Reload; no delayed result will be saved.':
    [
      'The test was hidden during the operation. Reload; no delayed result will be saved.',
      '操作期间测试被隐藏。请刷新；延迟结果不会保存。',
    ],
  'The test already has a package or fictional data use has not been confirmed.':
    [
      'The test already has a package or fictional data use has not been confirmed.',
      '测试已有数据包，或尚未确认使用虚构数据。',
    ],
  "This round's upload is already complete.": [
    "This round's upload is already complete.",
    '本轮上传已完成。',
  ],
  'sending or recording in Conversations': [
    'sending or recording in Conversations',
    '“对话”中的发送或录音',
  ],
  'Push delivery has not been configured in this environment yet.': [
    'Push delivery has not been configured in this environment yet.',
    '此环境尚未配置推送发送。',
  ],
  'The group was closed.': ['The group was closed.', '群组已关闭。'],
  'History exceeds the per-file record limit.': [
    'History exceeds the per-file record limit.',
    '历史超过每个文件的记录上限。',
  ],
  'The laboratory rejected the operation.': [
    'The laboratory rejected the operation.',
    '实验环境拒绝了操作。',
  ],
  'The link arrived with invalid or incomplete parameters. Return to the original browser and create a new request.':
    [
      'The link arrived with invalid or incomplete parameters. Return to the original browser and create a new request.',
      '链接参数无效或不完整。请返回原浏览器并创建新请求。',
    ],
  'The administrator must renew the link.': [
    'The administrator must renew the link.',
    '管理员需要续期此链接。',
  ],
  'The microphone sent data beyond the limit. Check the preserved excerpt.': [
    'The microphone sent data beyond the limit. Check the preserved excerpt.',
    '麦克风发送的数据超过限制。请检查保留的片段。',
  ],
  'The microphone was disconnected.': [
    'The microphone was disconnected.',
    '麦克风已断开连接。',
  ],
  'The microphone did not stop normally. Check the captured excerpt that was preserved.':
    [
      'The microphone did not stop normally. Check the captured excerpt that was preserved.',
      '麦克风未正常停止。请检查已保留的录音片段。',
    ],
  'The microphone did not respond in time. Try again.': [
    'The microphone did not respond in time. Try again.',
    '麦克风未及时响应。请重试。',
  ],
  'The microphone stopped producing audio. Check the preserved excerpt.': [
    'The microphone stopped producing audio. Check the preserved excerpt.',
    '麦克风停止产生音频。请检查保留的片段。',
  ],
  'Minimal exposure: invitation only, no presence, GIFs as links and no push.':
    [
      'Minimal exposure: invitation only, no presence, GIFs as links and no push.',
      '最低曝光：仅通过邀请联系，不显示在线状态，GIF 仅保留链接，不启用推送。',
    ],
  'The reason is visible to the participant and managers. Managers must lose their role before being sanctioned.':
    [
      'The reason is visible to the participant and managers. Managers must lose their role before being sanctioned.',
      '原因对成员和管理员可见。管理员必须先解除职务，才能受到处罚。',
    ],
  'The browser interrupted recording. Check the preserved excerpt when you return.':
    [
      'The browser interrupted recording. Check the preserved excerpt when you return.',
      '浏览器中断了录音。返回后请检查保留的片段。',
    ],
  'The browser did not complete offline mode. Reopen the page to try again.': [
    'The browser did not complete offline mode. Reopen the page to try again.',
    '浏览器未完成离线模式设置。请重新打开页面以重试。',
  ],
  'The browser did not allow recording. Try again.': [
    'The browser did not allow recording. Try again.',
    '浏览器未允许录音。请重试。',
  ],
  'The browser suspended the microphone.': [
    'The browser suspended the microphone.',
    '浏览器暂停了麦克风。',
  ],
  'The other client has not published its key yet.': [
    'The other client has not published its key yet.',
    '另一客户端尚未发布密钥。',
  ],
  'The package could not open: different signature or tampered data.': [
    'The package could not open: different signature or tampered data.',
    '无法打开数据包：签名不同或数据遭到篡改。',
  ],
  'The package belongs to another origin.': [
    'The package belongs to another origin.',
    '数据包属于其他来源。',
  ],
  "This browser's opening request was lost. Cancel and reconnect.": [
    "This browser's opening request was lost. Cancel and reconnect.",
    '此浏览器的打开请求已丢失。请取消后重新连接。',
  ],
  'The recovery request expired.': [
    'The recovery request expired.',
    '恢复请求已过期。',
  ],
  'The recovery request expired. Start again.': [
    'The recovery request expired. Start again.',
    '恢复请求已过期。请重新开始。',
  ],
  'The request timed out.': ['The request timed out.', '请求超时。'],
  'The request was interrupted.': [
    'The request was interrupted.',
    '请求已中断。',
  ],
  'The request was rejected at entry: it may have expired, been cancelled or already signed, or not match the ecosystem. Return to the original browser and create a new request.':
    [
      'The request was rejected at entry: it may have expired, been cancelled or already signed, or not match the ecosystem. Return to the original browser and create a new request.',
      '请求在入口处被拒绝：可能已过期、被取消、已签名，或生态系统不匹配。请返回原浏览器并创建新请求。',
    ],
  'The request was rejected at entry. Return to the original browser and create a new request.':
    [
      'The request was rejected at entry. Return to the original browser and create a new request.',
      '请求在入口处被拒绝。请返回原浏览器并创建新请求。',
    ],
  'The wallet request expired. Open your account again.': [
    'The wallet request expired. Open your account again.',
    '钱包请求已过期。请重新打开账户。',
  ],
  'The wallet request expired. Tap Open account to try again.': [
    'The wallet request expired. Tap Open account to try again.',
    '钱包请求已过期。请点击“打开账户”以重试。',
  ],
  'The request did not reach the approval page. Return to the original browser and create a new request.':
    [
      'The request did not reach the approval page. Return to the original browser and create a new request.',
      '请求未到达批准页面。请返回原浏览器并创建新请求。',
    ],
  'The seven-day deadline passed without approval. The file is being discarded.':
    [
      'The seven-day deadline passed without approval. The file is being discarded.',
      '七天期限内未获批准。文件正在清除。',
    ],
  'The camera-opening deadline passed. Try again or copy the code.': [
    'The camera-opening deadline passed. Try again or copy the code.',
    '打开摄像头的期限已到。请重试或复制代码。',
  ],
  'The deadline received for opening the wallet is invalid or has passed. Create a new request.':
    [
      'The deadline received for opening the wallet is invalid or has passed. Create a new request.',
      '打开钱包的期限无效或已过。请创建新请求。',
    ],
  'Offline preparation continues. Keep the app open and connected; the current version remains available.':
    [
      'Offline preparation continues. Keep the app open and connected; the current version remains available.',
      '离线准备仍在进行。请保持应用打开并联网；当前版本仍可使用。',
    ],
  'Microphone processing was interrupted.': [
    'Microphone processing was interrupted.',
    '麦克风处理已中断。',
  ],
  'Your text and selected attachments will be lost.': [
    'Your text and selected attachments will be lost.',
    '已撰写的文字和所选附件将丢失。',
  ],
  'The receiver for this sign-in is unavailable. Start again.': [
    'The receiver for this sign-in is unavailable. Start again.',
    '此登录的接收端不可用。请重新开始。',
  ],
  'Mobile return requires HTTPS.': [
    'Mobile return requires HTTPS.',
    '手机返回流程需要 HTTPS。',
  ],
  'The service took too long to respond. Try again.': [
    'The service took too long to respond. Try again.',
    '服务响应超时。请重试。',
  ],
  'The server rejected the request.': [
    'The server rejected the request.',
    '服务器拒绝了请求。',
  ],
  'The system interrupted the microphone.': [
    'The system interrupted the microphone.',
    '系统中断了麦克风。',
  ],
  'Object does not match.': ['Object does not match.', '对象不匹配。'],
  Objects: ['Objects', '物品'],
  'Hide or show in my feeds': [
    'Hide or show in my feeds',
    '在我的动态中隐藏或显示',
  ],
  'Hide through moderation': ['Hide through moderation', '通过审核隐藏'],
  'Hide post': ['Hide post', '隐藏帖子'],
  Hidden: ['Hidden', '已隐藏'],
  'Make {0} the owner now? They do not need to accept. You will become a regular member.':
    [
      'Make {0} the owner now? They do not need to accept. You will become a regular member.',
      '立即让 {0} 成为所有者？对方无需接受。你将成为普通成员。',
    ],
  'Make owner': ['Make owner', '设为所有者'],
  'Choose the new owner': ['Choose the new owner', '选择新的所有者'],
  'They become the owner right away, without accepting. You leave the group and lose access to the remote vault.':
    [
      'They become the owner right away, without accepting. You leave the group and lose access to the remote vault.',
      '对方将立即成为所有者，无需接受。你将退出群组并失去访问远程保险库的权限。',
    ],
  'Offer transfer': ['Offer transfer', '提出转让'],
  Online: ['Online', '在线'],
  "Optional. Publish the TXT record in the domain's DNS panel. The link may be shared; it does not prove legal ownership or reputation.":
    [
      "Optional. Publish the TXT record in the domain's DNS panel. The link may be shared; it does not prove legal ownership or reputation.",
      '选填。请在域名 DNS 面板中发布 TXT 记录。关联关系可分享，但不能证明合法所有权或信誉。',
    ],
  'Message options': ['Message options', '消息选项'],
  'Options for {0}': ['Options for {0}', '{0} 的选项'],
  'Follow options unavailable.': [
    'Follow options unavailable.',
    '关注选项不可用。',
  ],
  'User options': ['User options', '用户选项'],
  'Invalid group media operation.': [
    'Invalid group media operation.',
    '群组媒体操作无效。',
  ],
  'Operation outside the first prototype.': [
    'Operation outside the first prototype.',
    '操作不在首个原型的范围内。',
  ],
  'Operation unavailable.': ['Operation unavailable.', '操作不可用。'],
  'Operation unavailable. Check the state before retrying.': [
    'Operation unavailable. Check the state before retrying.',
    '操作不可用。请检查状态后重试。',
  ],
  'Operation interrupted. If reset was already sent, check storage before retrying.':
    [
      'Operation interrupted. If reset was already sent, check storage before retrying.',
      '操作已中断。如果已发送重置请求，请检查存储状态后重试。',
    ],
  'Operation interrupted. If cleanup was sent, check the remote state.': [
    'Operation interrupted. If cleanup was sent, check the remote state.',
    '操作已中断。如果已发送清理请求，请检查远程状态。',
  ],
  'Operation not completed. Check your wallet and connection, then try again.':
    [
      'Operation not completed. Check your wallet and connection, then try again.',
      '操作未完成。请检查钱包和连接后重试。',
    ],
  'Operation not confirmed. Try again.': [
    'Operation not confirmed. Try again.',
    '操作未确认。请重试。',
  ],
  'operation rejected': ['operation rejected', '操作被拒绝'],
  'Operation rejected. Check the secret, identity, revision and integrity; no plaintext history was sent.':
    [
      'Operation rejected. Check the secret, identity, revision and integrity; no plaintext history was sent.',
      '操作被拒绝。请检查密钥、身份、修订版本和完整性；未发送任何明文历史。',
    ],
  'Duplicate operation in the chain.': [
    'Duplicate operation in the chain.',
    '链中存在重复操作。',
  ],
  'operation requested': ['operation requested', '已请求操作'],
  'Invalid local budget.': ['Invalid local budget.', '本地预算无效。'],
  'Invalid group order.': ['Invalid group order.', '群组顺序无效。'],
  'Invalid removal order.': ['Invalid removal order.', '移除顺序无效。'],
  'Backup order does not match.': [
    'Backup order does not match.',
    '备份顺序不匹配。',
  ],
  'Index order does not match.': [
    'Index order does not match.',
    '索引顺序不匹配。',
  ],
  Sort: ['Sort', '排序'],
  'Sort comments': ['Sort comments', '排序评论'],
  'Sort posts': ['Sort posts', '排序帖子'],
  'Organization registered.': ['Organization registered.', '组织已注册。'],
  'Organizations and signed authorizations': [
    'Organizations and signed authorizations',
    '组织与签名授权',
  ],
  'Organizations and representatives': [
    'Organizations and representatives',
    '组织与代表',
  ],
  'Group origin differs from the backup account.': [
    'Group origin differs from the backup account.',
    '群组来源与备份账户不一致。',
  ],
  'Invalid test origin.': ['Invalid test origin.', '测试来源无效。'],
  'Status origin incomplete.': [
    'Status origin incomplete.',
    '状态来源不完整。',
  ],
  'Invalid origin.': ['Invalid origin.', '来源无效。'],
  'Original for case {0} — SHA-256 verified': [
    'Original for case {0} — SHA-256 verified',
    '案例 {0} 的原始文件 — SHA-256 已核验',
  ],
  "The author's devices changed. Try again.": [
    "The author's devices changed. Try again.",
    '作者的设备已更改。请重试。',
  ],
  'Other trending communities': ['Other trending communities', '其他热门社区'],
  'Other tags': ['Other tags', '其他标签'],
  'Listen to call': ['Listen to call', '收听通话'],
  'Listen to voice message': ['Listen to voice message', '播放语音消息'],
  'Package {0} recovered with a new signature from account {1}. No previous signature or key was kept by the laboratory.':
    [
      'Package {0} recovered with a new signature from account {1}. No previous signature or key was kept by the laboratory.',
      '数据包 {0} 已通过账户 {1} 的新签名恢复。实验环境未保留任何旧签名或密钥。',
    ],
  'Encrypted package received by the laboratory. The recipient can retrieve it.':
    [
      'Encrypted package received by the laboratory. The recipient can retrieve it.',
      '实验环境已收到加密数据包。接收者可以获取。',
    ],
  'Key package unauthorized or invalid.': [
    'Key package unauthorized or invalid.',
    '密钥包未获授权或无效。',
  ],
  'Emoji package exceeds the limit.': [
    'Emoji package exceeds the limit.',
    '表情包超过限制。',
  ],
  'Emoji package unavailable.': [
    'Emoji package unavailable.',
    '表情包不可用。',
  ],
  "Package from this browser's storage": [
    "Package from this browser's storage",
    '此浏览器存储中的数据包',
  ],
  'Test package exceeds the limit.': [
    'Test package exceeds the limit.',
    '测试数据包超过限制。',
  ],
  'Invalid test package.': ['Invalid test package.', '测试数据包无效。'],
  'Page {0} of {1}': ['Page {0} of {1}', '第 {0} 页，共 {1} 页'],
  'Invalid search page.': ['Invalid search page.', '搜索页无效。'],
  'Invalid vault page.': ['Invalid vault page.', '保险库页面无效。'],
  'Vault page omitted.': ['Vault page omitted.', '保险库页面缺失。'],
  'Invalid directory page.': ['Invalid directory page.', '目录页无效。'],
  'Invalid device page.': ['Invalid device page.', '设备页无效。'],
  'Invalid group message page.': [
    'Invalid group message page.',
    '群组消息页无效。',
  ],
  'Proof page incomplete.': ['Proof page incomplete.', '证明页面不完整。'],
  'Invalid removals page.': ['Invalid removals page.', '移除记录页面无效。'],
  'Invalid DM directory page.': [
    'Invalid DM directory page.',
    '私信目录页无效。',
  ],
  'Historical DM page did not advance.': [
    'Historical DM page did not advance.',
    '历史私信页面未推进。',
  ],
  'Historical page exceeds the limit.': [
    'Historical page exceeds the limit.',
    '历史页面超过限制。',
  ],
  'Historical page belongs to another account.': [
    'Historical page belongs to another account.',
    '历史页面属于另一个账户。',
  ],
  'Invalid personal DM page.': [
    'Invalid personal DM page.',
    '个人私信页面无效。',
  ],
  'Group pagination does not match.': [
    'Group pagination does not match.',
    '群组分页不匹配。',
  ],
  'Group list pagination does not match.': [
    'Group list pagination does not match.',
    '群组列表分页不匹配。',
  ],
  'Message pagination does not match.': [
    'Message pagination does not match.',
    '消息分页不匹配。',
  ],
  'Removal pagination does not match.': [
    'Removal pagination does not match.',
    '移除记录分页不匹配。',
  ],
  'Emoji panel incomplete.': ['Emoji panel incomplete.', '表情面板不完整。'],
  'Representative panel unavailable.': [
    'Representative panel unavailable.',
    '代表面板不可用。',
  ],
  "To open your wallet, use the HTTPS test address on your device. This computer's loopback address cannot be used for mobile connections.":
    [
      "To open your wallet, use the HTTPS test address on your device. This computer's loopback address cannot be used for mobile connections.",
      '请在设备上使用 HTTPS 测试地址打开钱包。此电脑的回环地址无法用于手机连接。',
    ],
  "To sign organizations and authorizations, open 0xDMme in your wallet's browser or use an extension. Returning these signatures to Chrome/Safari on mobile is still pending.":
    [
      "To sign organizations and authorizations, open 0xDMme in your wallet's browser or use an extension. Returning these signatures to Chrome/Safari on mobile is still pending.",
      '签署组织和授权时，请在钱包浏览器中打开 0xDMme，或使用扩展程序。这些签名返回手机 Chrome/Safari 的流程仍待完成。',
    ],
  'Stop voice recording before using the microphone.': [
    'Stop voice recording before using the microphone.',
    '使用麦克风前，请先停止语音录制。',
  ],
  'Stop recording and check the preview before sending.': [
    'Stop recording and check the preview before sending.',
    '请停止录音并检查预览后再发送。',
  ],
  'Stop or cancel voice recording before starting or answering a call. The preview remains available.':
    [
      'Stop or cancel voice recording before starting or answering a call. The preview remains available.',
      '发起或接听通话前，请停止或取消语音录制。预览仍会保留。',
    ],
  'Some settings were not applied. Adjust the remaining ones in Profile.': [
    'Some settings were not applied. Adjust the remaining ones in Profile.',
    '部分设置未应用。请在“个人资料”中调整剩余设置。',
  ],
  'Backup part missing.': ['Backup part missing.', '缺少备份分片。'],
  'Invalid backup part.': ['Invalid backup part.', '备份分片无效。'],
  'Draft part missing. Resending was not confirmed.': [
    'Draft part missing. Resending was not confirmed.',
    '缺少草稿分片。重发未确认。',
  ],
  'Local part missing or corrupted; sending was not confirmed.': [
    'Local part missing or corrupted; sending was not confirmed.',
    '本地分片缺失或损坏；发送未确认。',
  ],
  'Received part tampered with.': [
    'Received part tampered with.',
    '收到的分片遭到篡改。',
  ],
  'Backup parts exceed the limit.': [
    'Backup parts exceed the limit.',
    '备份分片超过限制。',
  ],
  'Historical parts exceed the limit.': [
    'Historical parts exceed the limit.',
    '历史分片超过限制。',
  ],
  'Unrelated parts in the report.': [
    'Unrelated parts in the report.',
    '报告中存在无关分片。',
  ],
  Participation: ['Participation', '参与'],
  'Participation and reports': ['Participation and reports', '参与与举报'],
  'Participation ended: community archived.': [
    'Participation ended: community archived.',
    '参与已结束：社区已归档。',
  ],
  'Membership changed during backup. Try again.': [
    'Membership changed during backup. Try again.',
    '备份期间成员身份已更改。请重试。',
  ],
  'Historical participant does not match.': [
    'Historical participant does not match.',
    '历史成员不匹配。',
  ],
  'Participant has no directory.': [
    'Participant has no directory.',
    '成员缺少目录。',
  ],
  'Participants changed while reading. Try again.': [
    'Participants changed while reading. Try again.',
    '读取期间成员已更改。请重试。',
  ],
  Pass: ['Pass', '通过'],
  'Pause voice message': ['Pause voice message', '暂停语音消息'],
  'Ask your contact for permission to send new messages. Your saved history remains available.':
    [
      'Ask your contact for permission to send new messages. Your saved history remains available.',
      '请请求联系人允许发送新消息。已保存的历史仍可使用。',
    ],
  'Request a conversation with @{0}. They must accept.': [
    'Request a conversation with @{0}. They must accept.',
    '向 @{0} 发起聊天请求。对方需要接受。',
  ],
  'Request missing or lost. Return to the tab that started sign-in and create a new request.':
    [
      'Request missing or lost. Return to the tab that started sign-in and create a new request.',
      '请求缺失或丢失。请返回发起登录的标签页并创建新请求。',
    ],
  'Request missing or lost. Return to the original browser and create a new request.':
    [
      'Request missing or lost. Return to the original browser and create a new request.',
      '请求缺失或丢失。请返回原浏览器并创建新请求。',
    ],
  'Request missing. Start again.': [
    'Request missing. Start again.',
    '缺少请求。请重新开始。',
  ],
  'Request missing. Restart from the original browser.': [
    'Request missing. Restart from the original browser.',
    '缺少请求。请从原浏览器重新开始。',
  ],
  'Opening request does not match.': [
    'Opening request does not match.',
    '打开请求不匹配。',
  ],
  'Approval request missing or over the limit.': [
    'Approval request missing or over the limit.',
    '批准请求缺失或超过限制。',
  ],
  'Invalid approval request.': ['Invalid approval request.', '批准请求无效。'],
  'Conversation request': ['Conversation request', '聊天请求'],
  'Photo request repeated with different content.': [
    'Photo request repeated with different content.',
    '图片请求被重复提交，但内容不同。',
  ],
  'Microphone request cancelled. No audio sent.': [
    'Microphone request cancelled. No audio sent.',
    '麦克风请求已取消。未发送音频。',
  ],
  'Recovery request missing.': ['Recovery request missing.', '缺少恢复请求。'],
  'Recovery request exceeds the limit.': [
    'Recovery request exceeds the limit.',
    '恢复请求超过限制。',
  ],
  'Linking request does not match.': [
    'Linking request does not match.',
    '关联请求不匹配。',
  ],
  'Request does not match.': ['Request does not match.', '请求不匹配。'],
  'Request ended or wallet changed.': [
    'Request ended or wallet changed.',
    '请求已结束或钱包已更改。',
  ],
  'Request ended.': ['Request ended.', '请求已结束。'],
  'Request sent. Waiting for @{0} to accept.': [
    'Request sent. Waiting for @{0} to accept.',
    '请求已发送。等待 @{0} 接受。',
  ],
  'Request exceeds the permitted size.': [
    'Request exceeds the permitted size.',
    '请求超过允许的大小。',
  ],
  'Request exceeds the limit.': [
    'Request exceeds the limit.',
    '请求超过限制。',
  ],
  'Request expired or invalid.': [
    'Request expired or invalid.',
    '请求已过期或无效。',
  ],
  'Request expired. Return to the original browser and start a new request.': [
    'Request expired. Return to the original browser and start a new request.',
    '请求已过期。请返回原浏览器并发起新请求。',
  ],
  'Request interrupted or expired. Start again.': [
    'Request interrupted or expired. Start again.',
    '请求已中断或过期。请重新开始。',
  ],
  'Request invalid, changed, expired or unavailable. Restart from the original browser.':
    [
      'Request invalid, changed, expired or unavailable. Restart from the original browser.',
      '请求无效、已更改、过期或不可用。请从原浏览器重新开始。',
    ],
  'Invalid request.': ['Invalid request.', '请求无效。'],
  'Invalid request. Return to your browser and create a new request.': [
    'Invalid request. Return to your browser and create a new request.',
    '请求无效。请返回浏览器并创建新请求。',
  ],
  'Local photo request does not match.': [
    'Local photo request does not match.',
    '本地图片请求不匹配。',
  ],
  'Local request discarded. If the server already created the group, it remains in the list.':
    [
      'Local request discarded. If the server already created the group, it remains in the list.',
      '本地请求已丢弃。如果服务器已创建群组，该群组仍会保留在列表中。',
    ],
  'Declined request': ['Declined request', '已拒绝请求'],
  'Request declined. The same identity cannot repeat this request.': [
    'Request declined. The same identity cannot repeat this request.',
    '请求已拒绝。同一身份无法重复此请求。',
  ],
  'Request has no current authorization.': [
    'Request has no current authorization.',
    '请求缺少当前授权。',
  ],
  Requests: ['Requests', '请求'],
  'Conversation requests': ['Conversation requests', '聊天请求'],
  'Requests received on this page: {0}': [
    'Requests received on this page: {0}',
    '此页面收到的请求：{0}',
  ],
  Profile: ['Profile', '个人资料'],
  'Profile locked. Authorize this device through linking or recovery.': [
    'Profile locked. Authorize this device through linking or recovery.',
    '个人资料已锁定。请通过关联或恢复授权此设备。',
  ],
  'Shared profile': ['Shared profile', '已分享个人资料'],
  'Backup profile tampered with.': [
    'Backup profile tampered with.',
    '备份个人资料遭到篡改。',
  ],
  'Profile available.': ['Profile available.', '个人资料可用。'],
  'Profile and settings': ['Profile and settings', '个人资料与设置'],
  'Historical profile belongs to another group.': [
    'Historical profile belongs to another group.',
    '历史个人资料属于另一个群组。',
  ],
  'Invalid profile.': ['Invalid profile.', '个人资料无效。'],
  'Public profile': ['Public profile', '公开个人资料'],
  'Public profile · Open access': [
    'Public profile · Open access',
    '公开个人资料 · 公开阅读',
  ],
  'Public profile changed.': [
    'Public profile changed.',
    '公开个人资料已更改。',
  ],
  'Public profile since': ['Public profile since', '公开个人资料创建于'],
  'Historical public DM profile missing.': [
    'Historical public DM profile missing.',
    '缺少私信的历史公开个人资料。',
  ],
  'Public profile unavailable.': [
    'Public profile unavailable.',
    '公开个人资料不可用。',
  ],
  'Perfil recebido · cópia local offline': [
    'Received profile · offline local copy',
    '收到的个人资料 · 离线本地副本',
  ],
  'Removed profile': ['Removed profile', '已移除个人资料'],
  'Restored group profile does not match.': [
    'Restored group profile does not match.',
    '恢复的群组个人资料不匹配。',
  ],
  'Profile saved.': ['Profile saved.', '个人资料已保存。'],
  'Selected profile: @{0}. Check before confirming.': [
    'Selected profile: @{0}. Check before confirming.',
    '已选择个人资料：@{0}。确认前请核对。',
  ],
  'Mutual profiles currently unavailable.': [
    'Mutual profiles currently unavailable.',
    '共同关注资料暂时不可用。',
  ],
  'Profiles you follow': ['Profiles you follow', '你关注的个人资料'],
  'profiles you follow in this community': [
    'profiles you follow in this community',
    '你在此社区中关注的个人资料',
  ],
  Period: ['Period', '时间范围'],
  'Permission not chosen yet.': [
    'Permission not chosen yet.',
    '尚未选择权限。',
  ],
  'GIF permission withdrawn.': [
    'GIF permission withdrawn.',
    'GIF 权限已撤回。',
  ],
  'Notification permission not granted. Change it in browser settings to try again.':
    [
      'Notification permission not granted. Change it in browser settings to try again.',
      '通知权限未授予。请在浏览器设置中更改后重试。',
    ],
  'Permissions verified. Continue loading the vault index before editing contacts.':
    [
      'Permissions verified. Continue loading the vault index before editing contacts.',
      '权限已核验。请继续加载保险库索引后再编辑联系人。',
    ],
  'Allow external GIFs in Profile to use KLIPY.': [
    'Allow external GIFs in Profile to use KLIPY.',
    '请在“个人资料”中允许外部 GIF，以使用 KLIPY。',
  ],
  Allowed: ['Allowed', '允许'],
  'Allowed / safe': ['Allowed / safe', '允许 / safe'],
  'Allow GIFs': ['Allow GIFs', '允许 GIF'],
  'Allow external media': ['Allow external media', '允许外部媒体'],
  'Search incomplete.': ['Search incomplete.', '搜索不完整。'],
  Search: ['Search', '搜索'],
  'person you follow': ['person you follow', '你关注的人'],
  'People and body': ['People and body', '人物与身体'],
  'people you follow': ['people you follow', '你关注的人'],
  'External player unavailable.': [
    'External player unavailable.',
    '外部播放器不可用。',
  ],
  'Generated PNG incomplete.': [
    'Generated PNG incomplete.',
    '生成的 PNG 不完整。',
  ],
  'Relay policy missing.': ['Relay policy missing.', '缺少中继策略。'],
  'By exact wallet address or invitation': [
    'By exact wallet address or invitation',
    '通过准确钱包地址或邀请',
  ],
  'Audio position': ['Audio position', '音频进度'],
  Post: ['Post', '帖子'],
  'Post with media': ['Post with media', '含媒体的帖子'],
  'Shared post': ['Shared post', '分享的帖子'],
  'Shared post unavailable.': [
    'Shared post unavailable.',
    '分享的帖子不可用。',
  ],
  'Post deleted by the author.': [
    'Post deleted by the author.',
    '帖子已被作者删除。',
  ],
  'Post unavailable.': ['Post unavailable.', '帖子不可用。'],
  'Post hidden by moderation.': [
    'Post hidden by moderation.',
    '帖子已被审核隐藏。',
  ],
  'Original post': ['Original post', '原始帖子'],
  'Original post: {0}': ['Original post: {0}', '原始帖子：{0}'],
  'Post published.': ['Post published.', '帖子已发布。'],
  'The post you are replying to': [
    'The post you are replying to',
    '你正在回复的帖子',
  ],
  'Post removed from saved items.': [
    'Post removed from saved items.',
    '帖子已从保存项中移除。',
  ],
  'Replied-to post': ['Replied-to post', '被回复的帖子'],
  'Replied-to post unavailable: {0}': [
    'Replied-to post unavailable: {0}',
    '被回复的帖子不可用：{0}',
  ],
  'Replied-to post unavailable.': [
    'Replied-to post unavailable.',
    '被回复的帖子不可用。',
  ],
  'Saved post': ['Saved post', '已保存帖子'],
  'Post saved.': ['Post saved.', '帖子已保存。'],
  'community.post-action': ['Post', '发布'],
  Posts: ['Posts', '帖子'],
  'Earlier posts': ['Earlier posts', '更早的帖子'],
  'Hidden posts and replies': [
    'Hidden posts and replies',
    '已隐藏的帖子与回复',
  ],
  'Posts unavailable.': ['Posts unavailable.', '帖子不可用。'],
  'Invalid recovery deadline.': [
    'Invalid recovery deadline.',
    '恢复期限无效。',
  ],
  'Invalid linking deadline.': ['Invalid linking deadline.', '关联期限无效。'],
  'Deadline passed. The file is being discarded.': [
    'Deadline passed. The file is being discarded.',
    '期限已到。文件正在清除。',
  ],
  'Invalid deadline.': ['Invalid deadline.', '期限无效。'],
  'Sound preference changed for this visit only: the browser did not allow saving.':
    [
      'Sound preference changed for this visit only: the browser did not allow saving.',
      '声音设置仅在本次访问中更改：浏览器未允许保存。',
    ],
  'Invalid push sound preference.': [
    'Invalid push sound preference.',
    '推送声音设置无效。',
  ],
  'Invalid sound preference. Sound is on for this visit; choose again in settings.':
    [
      'Invalid sound preference. Sound is on for this visit; choose again in settings.',
      '声音设置无效。本次访问启用声音；请在设置中重新选择。',
    ],
  'Invalid status preference.': [
    'Invalid status preference.',
    '状态设置无效。',
  ],
  'Invalid preference.': ['Invalid preference.', '偏好设置无效。'],
  'Push preferences saved on this device.': [
    'Push preferences saved on this device.',
    '推送设置已保存在此设备上。',
  ],
  'Preparation still in progress. Try again to resume.': [
    'Preparation still in progress. Try again to resume.',
    '准备仍在进行。请重试以恢复。',
  ],
  'session preparation': ['session preparation', '会话准备'],
  'Preparing backup: {0} items.': [
    'Preparing backup: {0} items.',
    '正在准备备份：{0} 项。',
  ],
  'Preparing offline interface…': [
    'Preparing offline interface…',
    '正在准备离线界面…',
  ],
  'Preparing full backup…': ['Preparing full backup…', '正在准备完整备份…'],
  'Preparing private ZIP with originals and results…': [
    'Preparing private ZIP with originals and results…',
    '正在准备包含原始文件与结果的私密 ZIP…',
  ],
  'Invalid presence.': ['Invalid presence.', '在线状态无效。'],
  'Presence, read receipts and who can find me': [
    'Presence, read receipts and who can find me',
    '在线状态、已读回执与谁能找到我',
  ],
  'Attachment preservation not confirmed.': [
    'Attachment preservation not confirmed.',
    '附件保留未确认。',
  ],
  Black: ['Black', '黑色'],
  'Pure black': ['Pure black', '纯黑'],
  Preview: ['Preview', '预览'],
  'Preview missing.': ['Preview missing.', '缺少预览。'],
  'Photo preview missing.': ['Photo preview missing.', '缺少图片预览。'],
  'Selected image preview': ['Selected image preview', '所选图片预览'],
  'Next status preview': ['Next status preview', '下一条状态预览'],
  'Preview unavailable for this image. The original file is preserved.': [
    'Preview unavailable for this image. The original file is preserved.',
    '此图片无法预览。原始文件已保留。',
  ],
  'Preview unavailable.': ['Preview unavailable.', '预览不可用。'],
  'Local preview of the original image': [
    'Local preview of the original image',
    '原始图片的本地预览',
  ],
  'Initial tags': ['Initial tags', '初始标签'],
  Privacy: ['Privacy', '隐私'],
  'External media privacy': ['External media privacy', '外部媒体隐私'],
  'Privacy settings not applied: the profile is loading or being edited.': [
    'Privacy settings not applied: the profile is loading or being edited.',
    '隐私设置未应用：个人资料正在加载或编辑中。',
  ],
  'Privacy saved for future statuses. Current publications retain their audience.':
    [
      'Privacy saved for future statuses. Current publications retain their audience.',
      '隐私设置已保存，将用于后续状态。当前发布内容保持原受众。',
    ],
  'Attachment processing timed out.': [
    'Attachment processing timed out.',
    '附件处理超时。',
  ],
  'Local attachment processing unavailable.': [
    'Local attachment processing unavailable.',
    '本地附件处理不可用。',
  ],
  'Local image processing unavailable.': [
    'Local image processing unavailable.',
    '本地图片处理不可用。',
  ],
  'Processing…': ['Processing…', '正在处理…'],
  'Prohibited / unsafe': ['Prohibited / unsafe', '禁止 / unsafe'],
  'Ready to test connection, signing and return. No 0xDMme account will be connected.':
    [
      'Ready to test connection, signing and return. No 0xDMme account will be connected.',
      '可以测试连接、签名和返回。不会连接任何 0xDMme 账户。',
    ],
  'Done. Your settings were saved to your account.': [
    'Done. Your settings were saved to your account.',
    '完成。设置已保存到账户。',
  ],
  Ownership: ['Ownership', '所有权'],
  'Ownership accepted.': ['Ownership accepted.', '所有权已接受。'],
  'Group ownership updated.': [
    'Group ownership updated.',
    '群组所有权已更新。',
  ],
  'Ownership and archiving': ['Ownership and archiving', '所有权与归档'],
  'Proof missing or expired.': [
    'Proof missing or expired.',
    '证明缺失或已过期。',
  ],
  'Proof missing.': ['Proof missing.', '缺少证明。'],
  'Proof cancelled. Old returns will not be accepted.': [
    'Proof cancelled. Old returns will not be accepted.',
    '证明已取消。旧返回结果不会被接受。',
  ],
  'Proof expired. Start a new connection.': [
    'Proof expired. Start a new connection.',
    '证明已过期。请发起新连接。',
  ],
  'Invalid proof.': ['Invalid proof.', '证明无效。'],
  'Proof not completed. Check your wallet and connection. If storage is blocked, allow it before starting a new proof.':
    [
      'Proof not completed. Check your wallet and connection. If storage is blocked, allow it before starting a new proof.',
      '证明未完成。请检查钱包和连接。如果存储被阻止，请允许存储后再发起新证明。',
    ],
  'Invalid private entry proof.': [
    'Invalid private entry proof.',
    '私密进入证明无效。',
  ],
  'Proof rejected.': ['Proof rejected.', '证明被拒绝。'],
  'Real ZK proof valid. Generation: {0} ms; verification: {1} ms. Proof: {2} bytes. Modification and a root without the member were rejected. Workers stopped.':
    [
      'Real ZK proof valid. Generation: {0} ms; verification: {1} ms. Proof: {2} bytes. Modification and a root without the member were rejected. Workers stopped.',
      '真实零知识证明有效。生成：{0} 毫秒；验证：{1} 毫秒。证明：{2} 字节。修改及不含该成员的根均被拒绝。工作线程已停止。',
    ],
  'Next page': ['Next page', '下一页'],
  Next: ['Next', '下一页'],
  Publication: ['Publication', '发布内容'],
  'Publication cancelled.': ['Publication cancelled.', '发布已取消。'],
  'public key publication': ['public key publication', '公钥发布'],
  'Publication does not match.': [
    'Publication does not match.',
    '发布内容不匹配。',
  ],
  'Publication ended or removed.': [
    'Publication ended or removed.',
    '发布已结束或内容已移除。',
  ],
  'Publication ended.': ['Publication ended.', '发布已结束。'],
  'Publication read': ['Publication read', '发布内容已读'],
  'Publication not confirmed.': ['Publication not confirmed.', '发布未确认。'],
  'Publication pending. Resume or cancel the upload before preparing another status.':
    [
      'Publication pending. Resume or cancel the upload before preparing another status.',
      '发布待完成。请恢复或取消上传后，再准备下一条状态。',
    ],
  Publications: ['Publications', '发布内容'],
  'Community publications': ['Community publications', '社区发布内容'],
  'Published in this period': ['Published in this period', '本时段发布'],
  'Publishing status…': ['Publishing status…', '正在发布状态…'],
  'Publish post': ['Publish post', '发布帖子'],
  'Publish reply': ['Publish reply', '发布回复'],
  'Publish status': ['Publish status', '发布状态'],
  'Push, sounds and conversation muting': [
    'Push, sounds and conversation muting',
    '推送、声音与对话静音',
  ],
  'Contact invitation QR code': [
    'Contact invitation QR code',
    '联系人邀请二维码',
  ],
  'Device linking QR code': ['Device linking QR code', '设备关联二维码'],
  'QR code exceeds the limit.': [
    'QR code exceeds the limit.',
    '二维码超过限制。',
  ],
  'Invalid confirmation QR code.': [
    'Invalid confirmation QR code.',
    '确认二维码无效。',
  ],
  'analyzed frame': ['analyzed frame', '已分析帧'],
  'analyzed frames': ['analyzed frames', '已分析帧'],
  'Who can request a conversation': [
    'Who can request a conversation',
    '谁可以申请聊天',
  ],
  'Wants to chat · {0} · {1}': [
    'Wants to chat · {0} · {1}',
    '想与你聊天 · {0} · {1}',
  ],
  'I want to archive, preserving content and records.': [
    'I want to archive, preserving content and records.',
    '我要归档，并保留内容与记录。',
  ],
  'I want to reopen participation.': [
    'I want to reopen participation.',
    '我要重新开放参与。',
  ],
  'Local root changed.': ['Local root changed.', '本地根已更改。'],
  Ranking: ['Ranking', '排行榜'],
  'Community ranking': ['Community ranking', '社区排行榜'],
  'Draft predates cleanup. No removed content was republished; discard it or recreate explicitly.':
    [
      'Draft predates cleanup. No removed content was republished; discard it or recreate explicitly.',
      '草稿早于清理。没有重新发布已移除内容；请丢弃草稿或主动重新创建。',
    ],
  'Invalid DM draft.': ['Invalid DM draft.', '私信草稿无效。'],
  'Invalid group draft.': ['Invalid group draft.', '群组草稿无效。'],
  'Status draft ended.': ['Status draft ended.', '状态草稿已结束。'],
  'Invalid draft.': ['Invalid draft.', '草稿无效。'],
  'Draft preserved. Reconnect to confirm it in the vault.': [
    'Draft preserved. Reconnect to confirm it in the vault.',
    '草稿已保留。请重新联网以在保险库中确认。',
  ],
  'Reopen the account before saving the profile.': [
    'Reopen the account before saving the profile.',
    '请重新打开账户后再保存个人资料。',
  ],
  'Reopen community': ['Reopen community', '重新开放社区'],
  Reaction: ['Reaction', '表情回应'],
  'Invalid reaction.': ['Invalid reaction.', '表情回应无效。'],
  'React…': ['React…', '回应…'],
  'Re-enable microphone': ['Re-enable microphone', '重新启用麦克风'],
  'Reload community': ['Reload community', '重新加载社区'],
  'Reload conversation': ['Reload conversation', '重新加载对话'],
  'Reload list': ['Reload list', '重新加载列表'],
  'Reload notifications': ['Reload notifications', '重新加载通知'],
  'Reload posts': ['Reload posts', '重新加载帖子'],
  'Recebida e preservada': ['Received and preserved', '已接收并保留'],
  "Received by one of the recipient's devices": [
    "Received by one of the recipient's devices",
    '接收者的一台设备已收到',
  ],
  'Incoming calls enabled.': ['Incoming calls enabled.', '来电已启用。'],
  'Incoming calls disabled.': ['Incoming calls disabled.', '来电已关闭。'],
  'Live updates connected.': ['Live updates connected.', '实时更新已连接。'],
  'Live updates ended.': ['Live updates ended.', '实时更新已结束。'],
  'Live updates unavailable.': [
    'Live updates unavailable.',
    '实时更新不可用。',
  ],
  'Live updates unavailable. The app keeps checking every 30 seconds; you can also sync.':
    [
      'Live updates unavailable. The app keeps checking every 30 seconds; you can also sync.',
      '实时更新不可用。应用会继续每 30 秒检查一次；你也可以手动同步。',
    ],
  'Live updates paused. The app checks the current state when you return.': [
    'Live updates paused. The app checks the current state when you return.',
    '实时更新已暂停。返回后，应用会检查当前状态。',
  ],
  'Live updates unresponsive.': [
    'Live updates unresponsive.',
    '实时更新无响应。',
  ],
  'Invalid receipt.': ['Invalid receipt.', '接收凭据无效。'],
  Recent: ['Recent', '最近'],
  'Reconnecting through TURN…': [
    'Reconnecting through TURN…',
    '正在通过 TURN 重新连接…',
  ],
  "Reconnect to cancel this attachment's remote reservation.": [
    "Reconnect to cancel this attachment's remote reservation.",
    '请重新联网以取消此附件的远程预留。',
  ],
  'Reconnect to confirm deletion of a send that may have been accepted.': [
    'Reconnect to confirm deletion of a send that may have been accepted.',
    '请重新联网，以确认删除可能已被接受的发送内容。',
  ],
  'Reconnect to release the remote reservation before discarding.': [
    'Reconnect to release the remote reservation before discarding.',
    '丢弃前请重新联网，以释放远程预留。',
  ],
  'DM recovery missing.': ['DM recovery missing.', '缺少私信恢复信息。'],
  'DM recovery has concurrent versions. Preserve copies before resolving.': [
    'DM recovery has concurrent versions. Preserve copies before resolving.',
    '私信恢复信息存在并发版本。解决前请保留副本。',
  ],
  'Member recovery missing.': [
    'Member recovery missing.',
    '缺少成员恢复信息。',
  ],
  'Recovery belongs to another account.': [
    'Recovery belongs to another account.',
    '恢复信息属于另一个账户。',
  ],
  'Contact recovery does not match.': [
    'Contact recovery does not match.',
    '联系人恢复信息不匹配。',
  ],
  'Recipient recovery not authorized.': [
    'Recipient recovery not authorized.',
    '接收者恢复信息未获授权。',
  ],
  'Recovery incomplete: the old profile cannot open on this device. Configure it in the browser holding the profile key.':
    [
      'Recovery incomplete: the old profile cannot open on this device. Configure it in the browser holding the profile key.',
      '恢复不完整：旧个人资料无法在此设备上打开。请在持有个人资料密钥的浏览器中配置。',
    ],
  'Recovery not completed. Check your account and connection; restart the request in the original browser.':
    [
      'Recovery not completed. Check your account and connection; restart the request in the original browser.',
      '恢复未完成。请检查账户和连接，并在原浏览器中重新发起请求。',
    ],
  'Recovery or device lacks current authorization.': [
    'Recovery or device lacks current authorization.',
    '恢复信息或设备缺少当前授权。',
  ],
  'Recovery rejected: invalid key, account or integrity.': [
    'Recovery rejected: invalid key, account or integrity.',
    '恢复被拒绝：密钥、账户或完整性无效。',
  ],
  'Recovering the request started in your browser…': [
    'Recovering the request started in your browser…',
    '正在恢复由你浏览器发起的请求…',
  ],
  Declined: ['Declined', '已拒绝'],
  Decline: ['Decline', '拒绝'],
  'Invalid EVM network.': ['Invalid EVM network.', 'EVM 网络无效。'],
  'Reference · {0}': ['Reference · {0}', '参考 · {0}'],
  'Block reference: {0}': ['Block reference: {0}', '拦截参考：{0}'],
  'Reference for case {0} saved. Scores preserved.': [
    'Reference for case {0} saved. Scores preserved.',
    '案例 {0} 的参考标注已保存。评分已保留。',
  ],
  'Reference incomplete.': ['Reference incomplete.', '引用不完整。'],
  'Recording appeal…': ['Recording appeal…', '正在记录申诉…'],
  'Record from your private contacts': [
    'Record from your private contacts',
    '你的私密联系人记录',
  ],
  'Backup record exceeds the limit.': [
    'Backup record exceeds the limit.',
    '备份记录超过限制。',
  ],
  'Invalid call record.': ['Invalid call record.', '通话记录无效。'],
  'Invalid DM record.': ['Invalid DM record.', '私信记录无效。'],
  'Organization record does not match.': [
    'Organization record does not match.',
    '组织记录不匹配。',
  ],
  'Record exceeds the limit.': ['Record exceeds the limit.', '记录超过限制。'],
  'Historical record corrupted.': [
    'Historical record corrupted.',
    '历史记录损坏。',
  ],
  'Invalid historical record.': [
    'Invalid historical record.',
    '历史记录无效。',
  ],
  'Invalid record.': ['Invalid record.', '记录无效。'],
  'Unsupported record.': ['Unsupported record.', '不支持此记录。'],
  'Records exceed the limit.': ['Records exceed the limit.', '记录超过限制。'],
  'Duplicate records or selection over the limit.': [
    'Duplicate records or selection over the limit.',
    '记录重复或选择超过限制。',
  ],
  'Records duplicated, omitted or over the limit.': [
    'Records duplicated, omitted or over the limit.',
    '记录重复、缺失或超过限制。',
  ],
  Rules: ['Rules', '规则'],
  'Community rules': ['Community rules', '社区规则'],
  'Local rules': ['Local rules', '本地规则'],
  'Invalid private version relationship.': [
    'Invalid private version relationship.',
    '私密版本关系无效。',
  ],
  'Backup report exceeds the limit.': [
    'Backup report exceeds the limit.',
    '备份报告超过限制。',
  ],
  'Invalid omissions report.': ['Invalid omissions report.', '遗漏报告无效。'],
  'Report exceeds the limit.': ['Report exceeds the limit.', '报告超过限制。'],
  'Final report missing.': ['Final report missing.', '缺少最终报告。'],
  'Invalid report.': ['Invalid report.', '报告无效。'],
  'The relay received only the encrypted envelope in memory. The secret and history stayed on the client.':
    [
      'The relay received only the encrypted envelope in memory. The secret and history stayed on the client.',
      '中继仅在内存中收到加密封装。密钥和历史保留在客户端。',
    ],
  'Sender not authorized.': ['Sender not authorized.', '发送者未获授权。'],
  Removal: ['Removal', '移除'],
  'Remove some text to add the GIF.': [
    'Remove some text to add the GIF.',
    '请删减部分文字以添加 GIF。',
  ],
  Remove: ['Remove', '移除'],
  'Remove {0}': ['Remove {0}', '移除 {0}'],
  Today: ['Today', '今天'],
  Yesterday: ['Yesterday', '昨天'],
  'Earlier messages': ['Earlier messages', '更早的消息'],
  'Loading earlier messages…': [
    'Loading earlier messages…',
    '正在加载更早的消息…',
  ],
  '{0} MB of {1} MB': ['{0} MB of {1} MB', '{0} MB / {1} MB'],
  'Up to {0} files per send.': [
    'Up to {0} files per send.',
    '每次最多发送 {0} 个文件。',
  ],
  'Files sent together can take up to {0} MB.': [
    'Files sent together can take up to {0} MB.',
    '一起发送的文件总计最多 {0} MB。',
  ],
  'Remove {0} from the group?': [
    'Remove {0} from the group?',
    '将 {0} 移出群组？',
  ],
  'Remove current media': ['Remove current media', '移除当前媒体'],
  'Remove badge from member': ['Remove badge from member', '移除成员徽章'],
  'Remove banner': ['Remove banner', '移除横幅'],
  'Remove contact': ['Remove contact', '移除联系人'],
  'Remove from favorites': ['Remove from favorites', '从收藏中移除'],
  'Remove photo': ['Remove photo', '移除图片'],
  'Remove my reaction': ['Remove my reaction', '移除我的回应'],
  'Remove post from saved items': [
    'Remove post from saved items',
    '从保存项中移除帖子',
  ],
  'Duplicate or conflicting message.': [
    'Duplicate or conflicting message.',
    '消息重复或存在冲突。',
  ],
  'Representative: {0} · {1}': ['Representative: {0} · {1}', '代表：{0} · {1}'],
  'Play YouTube video': ['Play YouTube video', '播放 YouTube 视频'],
  Reserved: ['Reserved', '低曝光'],
  'Attachment reservations do not match.': [
    'Attachment reservations do not match.',
    '附件预留不匹配。',
  ],
  'Photo reservations do not match.': [
    'Photo reservations do not match.',
    '图片预留不匹配。',
  ],
  'Reset vault': ['Reset vault', '重置保险库'],
  "Reset the data preserved in this backup only from your server vault? Later messages and other people's copies remain.":
    [
      "Reset the data preserved in this backup only from your server vault? Later messages and other people's copies remain.",
      '仅从服务器上的你的保险库中重置此备份已保留的数据？后续消息和他人的副本仍会保留。',
    ],
  "Resolve this contact's versions before opening the list.": [
    "Resolve this contact's versions before opening the list.",
    '请解决此联系人的版本冲突后再打开列表。',
  ],
  "Resolve this contact's versions before saving.": [
    "Resolve this contact's versions before saving.",
    '请解决此联系人的版本冲突后再保存。',
  ],
  "Resolve this favorite's versions before continuing.": [
    "Resolve this favorite's versions before continuing.",
    '请解决此收藏项的版本冲突后再继续。',
  ],
  'Resolve invitation conflicts in the vault before creating another.': [
    'Resolve invitation conflicts in the vault before creating another.',
    '请先解决保险库中的邀请冲突，再创建新邀请。',
  ],
  'Resolve contact: check before saving': [
    'Resolve contact: check before saving',
    '解决联系人冲突：保存前请核对',
  ],
  'Resolve using this version': [
    'Resolve using this version',
    '使用此版本解决冲突',
  ],
  Replying: ['Replying', '正在回复'],
  Reply: ['Reply', '回复'],
  'Reply to post': ['Reply to post', '回复帖子'],
  'Response / review reason': ['Response / review reason', '回复/复核原因'],
  'Reply missing.': ['Reply missing.', '缺少回复。'],
  'Moderation response': ['Moderation response', '审核回复'],
  'Invalid signing response.': ['Invalid signing response.', '签名响应无效。'],
  'Invalid tag response.': ['Invalid tag response.', '标签响应无效。'],
  'Test response rejected.': ['Test response rejected.', '测试响应被拒绝。'],
  'Response exceeds the test budget.': [
    'Response exceeds the test budget.',
    '响应超过测试预算。',
  ],
  'Response exceeds the limit.': [
    'Response exceeds the limit.',
    '响应超过限制。',
  ],
  'Invalid collection response.': [
    'Invalid collection response.',
    '采集响应无效。',
  ],
  'Invalid server response.': ['Invalid server response.', '服务器响应无效。'],
  'Invalid response.': ['Invalid response.', '响应无效。'],
  'Reply in the discussion': ['Reply in the discussion', '讨论中的回复'],
  'Protected response missing.': [
    'Protected response missing.',
    '缺少受保护的响应。',
  ],
  'Reply published.': ['Reply published.', '回复已发布。'],
  'Reply: {0}': ['Reply: {0}', '回复：{0}'],
  'Reply: original message is outside this page or unavailable.': [
    'Reply: original message is outside this page or unavailable.',
    '回复：原始消息不在此页面中或不可用。',
  ],
  Replies: ['Replies', '回复'],
  'Replies to this comment': ['Replies to this comment', '此评论的回复'],
  'Earlier replies': ['Earlier replies', '更早的回复'],
  'Replies to your content': ['Replies to your content', '对你内容的回复'],
  'Replies to your content and posts/replies from accounts with notifications enabled.':
    [
      'Replies to your content and posts/replies from accounts with notifications enabled.',
      '对你内容的回复，以及已开启通知账户的帖子和回复。',
    ],
  'Replies unavailable for your membership.': [
    'Replies unavailable for your membership.',
    '你的成员身份无法访问回复。',
  ],
  Restored: ['Restored', '已恢复'],
  'Restore post': ['Restore post', '恢复帖子'],
  'Encrypted result sent. Return to the original browser; account opening will finish automatically. This page does not create a session or authorize devices.':
    [
      'Encrypted result sent. Return to the original browser; account opening will finish automatically. This page does not create a session or authorize devices.',
      '加密结果已发送。请返回原浏览器；账户打开流程会自动完成。此页面不会创建会话或授权设备。',
    ],
  'Analysis result': ['Analysis result', '分析结果'],
  'Uncertain result': ['Uncertain result', '结果不确定'],
  Results: ['Results', '结果'],
  'Remove share from my profile': [
    'Remove share from my profile',
    '取消在个人资料中分享',
  ],
  'Lift sanction': ['Lift sanction', '撤销处罚'],
  Resume: ['Resume', '恢复'],
  'Resume the pending creation with the same name or discard that request before creating another group.':
    [
      'Resume the pending creation with the same name or discard that request before creating another group.',
      '请使用相同名称恢复待完成的创建，或丢弃该请求后再创建其他群组。',
    ],
  'resume when opening the group.': [
    'resume when opening the group.',
    '打开群组时恢复。',
  ],
  'Recovery return unavailable, expired or rejected. Start again.': [
    'Recovery return unavailable, expired or rejected. Start again.',
    '恢复返回结果不可用、已过期或被拒绝。请重新开始。',
  ],
  'Invalid recovery return.': [
    'Invalid recovery return.',
    '恢复返回结果无效。',
  ],
  'Return invalid or from another proof.': [
    'Return invalid or from another proof.',
    '返回结果无效或来自其他证明。',
  ],
  'Return invalid or expired.': [
    'Return invalid or expired.',
    '返回结果无效或已过期。',
  ],
  'Invalid history revision.': [
    'Invalid history revision.',
    '历史修订版本无效。',
  ],
  'Revision: {0}': ['Revision: {0}', '修订版本：{0}'],
  'Revocation does not match.': [
    'Revocation does not match.',
    '撤销记录不匹配。',
  ],
  Revoked: ['Revoked', '已撤销'],
  Revoke: ['Revoke', '撤销'],
  'Revoke authorization': ['Revoke authorization', '撤销授权'],
  'Revoke this authorization? It cannot become valid again.': [
    'Revoke this authorization? It cannot become valid again.',
    '撤销此授权？撤销后无法重新生效。',
  ],
  'Revoke this device? It will lose access to new data.': [
    'Revoke this device? It will lose access to new data.',
    '撤销此设备的授权？设备将失去访问新数据的权限。',
  ],
  'Invalid round received from collection.': [
    'Invalid round received from collection.',
    '从采集端收到的轮次无效。',
  ],
  'Faces and emotions': ['Faces and emotions', '面部与情绪'],
  'Unknown route.': ['Unknown route.', '未知路由。'],
  'Rotation pending: sending blocked.': [
    'Rotation pending: sending blocked.',
    '轮换待完成：发送被阻止。',
  ],
  'Sign out of the current account before linking another.': [
    'Sign out of the current account before linking another.',
    '关联其他账户前，请先退出当前账户。',
  ],
  'Leave the group? You will lose access to the remote vault.': [
    'Leave the group? You will lose access to the remote vault.',
    '退出群组？你将失去访问远程保险库的权限。',
  ],
  Save: ['Save', '保存'],
  'Saving stores the nickname in contacts; a conversation request requires acceptance.':
    [
      'Saving stores the nickname in contacts; a conversation request requires acceptance.',
      '保存会将备注名存入联系人；聊天请求仍需要对方接受。',
    ],
  'Saving stores the contact; requesting a conversation still requires acceptance.':
    [
      'Saving stores the contact; requesting a conversation still requires acceptance.',
      '保存会存储联系人；申请聊天仍需要对方接受。',
    ],
  'Save to my contacts': ['Save to my contacts', '保存到我的联系人'],
  'Save on device': ['Save on device', '保存到设备'],
  'Save post': ['Save post', '保存帖子'],
  'Saving preserves previous versions and resolves the selected branches.': [
    'Saving preserves previous versions and resolves the selected branches.',
    '保存会保留先前版本，并解决所选分支的冲突。',
  ],
  'Save tag': ['Save tag', '保存标签'],
  'Save a full backup to keep your own copy.': [
    'Save a full backup to keep your own copy.',
    '保存完整备份，以保留自己的副本。',
  ],
  Saved: ['Saved', '已保存'],
  'Sanction lifted': ['Sanction lifted', '处罚已撤销'],
  'Sanctions and appeals': ['Sanctions and appeals', '处罚与申诉'],
  'Settings sections': ['Settings sections', '设置分区'],
  'DM secret missing from the vault. Restore your vault before continuing.': [
    'DM secret missing from the vault. Restore your vault before continuing.',
    '保险库中缺少私信密钥。请恢复保险库后继续。',
  ],
  'Invalid DM secret.': ['Invalid DM secret.', '私信密钥无效。'],
  'Invalid recovery secret.': ['Invalid recovery secret.', '恢复密钥无效。'],
  'Secret exceeds the format.': [
    'Secret exceeds the format.',
    '密钥超出格式限制。',
  ],
  'Fictional secret generated only in this browser. Copy it for the recovery test.':
    [
      'Fictional secret generated only in this browser. Copy it for the recovery test.',
      '虚构密钥仅在此浏览器中生成。请复制以用于恢复测试。',
    ],
  'Invalid secret.': ['Invalid secret.', '密钥无效。'],
  'Secrets belong to another version or account.': [
    'Secrets belong to another version or account.',
    '密钥属于其他版本或账户。',
  ],
  'Followed by {0}': ['Followed by {0}', '{0} 已关注'],
  'Followed by {0} and {1} more you follow': [
    'Followed by {0} and {1} more you follow',
    '{0} 和另外 {1} 位你关注的人已关注',
  ],
  Following: ['Following', '已关注'],
  Followers: ['Followers', '关注者'],
  'followers · archived': ['followers · archived', '位关注者 · 已归档'],
  'Mutual followers': ['Mutual followers', '共同关注者'],
  'Mutual followers unavailable.': [
    'Mutual followers unavailable.',
    '共同关注者不可用。',
  ],
  'Followers unavailable.': ['Followers unavailable.', '关注者不可用。'],
  'follow.following': ['Following', '关注'],
  Follow: ['Follow', '关注'],
  'Follow community or author': [
    'Follow community or author',
    '关注社区或作者',
  ],
  'Hold to record or tap twice.': [
    'Hold to record or tap twice.',
    '长按录音，或点击两次。',
  ],
  'Invalid device selection. Check the list again.': [
    'Invalid device selection. Check the list again.',
    '设备选择无效。请重新检查列表。',
  ],
  'Invalid selection.': ['Invalid selection.', '选择无效。'],
  "Select the open account's wallet to confirm sensitive actions.": [
    "Select the open account's wallet to confirm sensitive actions.",
    '请选择已打开账户的钱包，以确认敏感操作。',
  ],
  "Select the open account's wallet.": [
    "Select the open account's wallet.",
    '请选择已打开账户的钱包。',
  ],
  'Select the wallet and ecosystem from the original request.': [
    'Select the wallet and ecosystem from the original request.',
    '请选择原始请求的钱包和生态系统。',
  ],
  'Select and validate the saved file, then connect before cleanup.': [
    'Select and validate the saved file, then connect before cleanup.',
    '请先选择并验证已保存文件，再联网执行清理。',
  ],
  'Select images or complete the upload.': [
    'Select images or complete the upload.',
    '请选择图片或完成上传。',
  ],
  'Select an approved contact': [
    'Select an approved contact',
    '选择已批准的联系人',
  ],
  'Select an approved contact to forward to.': [
    'Select an approved contact to forward to.',
    '请选择已批准联系人以转发。',
  ],
  'Select a contact and write a message or choose an attachment.': [
    'Select a contact and write a message or choose an attachment.',
    '请选择联系人，并撰写消息或选择附件。',
  ],
  'Select an EVM account in your wallet.': [
    'Select an EVM account in your wallet.',
    '请在钱包中选择 EVM 账户。',
  ],
  'Select a Solana account that signs messages: the connection did not provide an authorized account.':
    [
      'Select a Solana account that signs messages: the connection did not provide an authorized account.',
      '请选择支持消息签名的 Solana 账户：连接未提供已授权账户。',
    ],
  'Select a conversation before changing alerts.': [
    'Select a conversation before changing alerts.',
    '更改通知前请选择对话。',
  ],
  'select a conversation first': [
    'select a conversation first',
    '请先选择对话',
  ],
  'Select a photo no larger than 3 MB.': [
    'Select a photo no larger than 3 MB.',
    '请选择不超过 3 MB 的图片。',
  ],
  'Select a static PNG, JPEG or WebP image no larger than 8 MiB.': [
    'Select a static PNG, JPEG or WebP image no larger than 8 MiB.',
    '请选择不超过 8 MiB 的静态 PNG、JPEG 或 WebP 图片。',
  ],
  'Select an image.': ['Select an image.', '请选择图片。'],
  'Without approval by {0}, the video stops being public and the file will be discarded.':
    [
      'Without approval by {0}, the video stops being public and the file will be discarded.',
      '若截至 {0} 仍未获批准，视频将不再公开，文件将被清除。',
    ],
  'Without approval, the file will be discarded by {0}.': [
    'Without approval, the file will be discarded by {0}.',
    '若未获批准，文件将于 {0} 前清除。',
  ],
  'No verified local authorization. Connect to recover.': [
    'No verified local authorization. Connect to recover.',
    '没有已验证的本地授权。请联网以恢复。',
  ],
  'No verified local authorization. Sign in and recover this device.': [
    'No verified local authorization. Sign in and recover this device.',
    '没有已验证的本地授权。请登录并恢复此设备。',
  ],
  'This device has no local key. Sign in and recover with authorization.': [
    'This device has no local key. Sign in and recover with authorization.',
    '此设备缺少本地密钥。请登录并通过授权恢复。',
  ],
  'Offline · saved history available on this device': [
    'Offline · saved history available on this device',
    '离线 · 此设备上的已保存历史可用',
  ],
  'Offline. Saved history remains available on this device.': [
    'Offline. Saved history remains available on this device.',
    '离线。此设备上的已保存历史仍可使用。',
  ],
  'No consent': ['No consent', '尚未同意'],
  'No conversations yet': ['No conversations yet', '暂无对话'],
  'No space for this mention. Remove some text.': [
    'No space for this mention. Remove some text.',
    '没有空间添加此提及。请删减部分文字。',
  ],
  'No modifier': ['No modifier', '无修饰'],
  Unnamed: ['Unnamed', '未命名'],
  'no HTTP response': ['no HTTP response', '无 HTTP 响应'],
  untitled: ['untitled', '无标题'],
  'Service unavailable. Try again.': [
    'Service unavailable. Try again.',
    '服务不可用。请重试。',
  ],
  'Session changed before the operation.': [
    'Session changed before the operation.',
    '操作前会话已更改。',
  ],
  'Session changed during signing.': [
    'Session changed during signing.',
    '签名期间会话已更改。',
  ],
  'Session changed during identity verification.': [
    'Session changed during identity verification.',
    '身份核验期间会话已更改。',
  ],
  'Session changed during the operation.': [
    'Session changed during the operation.',
    '操作期间会话已更改。',
  ],
  'Session changed during recovery.': [
    'Session changed during recovery.',
    '恢复期间会话已更改。',
  ],
  'Session changed during synchronization.': [
    'Session changed during synchronization.',
    '同步期间会话已更改。',
  ],
  'Session changed.': ['Session changed.', '会话已更改。'],
  'Session missing.': ['Session missing.', '缺少会话。'],
  'Session connected · open account in Profile → Devices': [
    'Session connected · open account in Profile → Devices',
    '会话已连接 · 请在“个人资料 → 设备”中打开账户',
  ],
  'Session connected. Open your account in Profile → Devices.': [
    'Session connected. Open your account in Profile → Devices.',
    '会话已连接。请在“个人资料 → 设备”中打开账户。',
  ],
  'Cryptographic session ended.': [
    'Cryptographic session ended.',
    '加密会话已结束。',
  ],
  'Call session ended.': ['Call session ended.', '通话会话已结束。'],
  'Invalid wallet session.': ['Invalid wallet session.', '钱包会话无效。'],
  'DM session changed.': ['DM session changed.', '私信会话已更改。'],
  'Session belongs to another application or network.': [
    'Session belongs to another application or network.',
    '会话属于其他应用或网络。',
  ],
  'Session differs from the requested device linking.': [
    'Session differs from the requested device linking.',
    '会话与请求的设备关联不一致。',
  ],
  'Status session changed or ended.': [
    'Status session changed or ended.',
    '状态会话已更改或结束。',
  ],
  'Session ended or sign-in rejected.': [
    'Session ended or sign-in rejected.',
    '会话已结束或登录被拒绝。',
  ],
  'Session ended.': ['Session ended.', '会话已结束。'],
  'Session expired. Sign in again.': [
    'Session expired. Sign in again.',
    '会话已过期。请重新登录。',
  ],
  'Session unavailable.': ['Session unavailable.', '会话不可用。'],
  'Session or community changed.': [
    'Session or community changed.',
    '会话或社区已更改。',
  ],
  'Session or group changed.': [
    'Session or group changed.',
    '会话或群组已更改。',
  ],
  'Session or page changed during preparation.': [
    'Session or page changed during preparation.',
    '准备期间会话或页面已更改。',
  ],
  'Session or synchronization changed.': [
    'Session or synchronization changed.',
    '会话或同步状态已更改。',
  ],
  'Session or status screen changed.': [
    'Session or status screen changed.',
    '会话或状态页面已更改。',
  ],
  'Your handle and photo in communities': [
    'Your handle and photo in communities',
    '社区中的用户名与图片',
  ],
  'Your storage is close to its limit.': [
    'Your storage is close to its limit.',
    '存储空间即将达到上限。',
  ],
  'Your banner was withheld from public view': [
    'Your banner was withheld from public view',
    '你的横幅未公开展示',
  ],
  'Your domain, for example cars.com': [
    'Your domain, for example cars.com',
    '你的域名，例如 cars.com',
  ],
  'Your status': ['Your status', '你的状态'],
  'Your status: publish or view': [
    'Your status: publish or view',
    '你的状态：发布或查看',
  ],
  'App shell incomplete.': ['App shell incomplete.', '应用外壳不完整。'],
  'Follow to enable notifications': [
    'Follow to enable notifications',
    '关注后启用通知',
  ],
  'Follow a community in Explore to find it here.': [
    'Follow a community in Explore to find it here.',
    '在“探索”中关注社区，即可在此处找到。',
  ],
  'Mute microphone': ['Mute microphone', '将麦克风静音'],
  Symbols: ['Symbols', '符号'],
  'Protected signaling unavailable.': [
    'Protected signaling unavailable.',
    '受保护信令不可用。',
  ],
  'Synchronization changed.': ['Synchronization changed.', '同步状态已更改。'],
  'Message synchronization superseded.': [
    'Message synchronization superseded.',
    '消息同步已被替代。',
  ],
  'DM vault synchronization did not finish.': [
    'DM vault synchronization did not finish.',
    '私信保险库同步未完成。',
  ],
  'Synchronization interrupted. Try again.': [
    'Synchronization interrupted. Try again.',
    '同步已中断。请重试。',
  ],
  'Synchronization not completed. Try again.': [
    'Synchronization not completed. Try again.',
    '同步未完成。请重试。',
  ],
  'Syncing messages… History opens after updates and deletions are checked.': [
    'Syncing messages… History opens after updates and deletions are checked.',
    '正在同步消息… 核对更新和删除记录后，历史将打开。',
  ],
  'Syncing…': ['Syncing…', '正在同步…'],
  'Sync now': ['Sync now', '立即同步'],
  'Sync before opening the attachment.': [
    'Sync before opening the attachment.',
    '打开附件前请先同步。',
  ],
  'Sync before searching; history is hidden.': [
    'Sync before searching; history is hidden.',
    '搜索前请先同步；历史已隐藏。',
  ],
  'Sync the vault before opening conversation preferences.': [
    'Sync the vault before opening conversation preferences.',
    '打开对话设置前请先同步保险库。',
  ],
  About: ['About', '关于'],
  'About and community rules': ['About and community rules', '社区介绍与规则'],
  'About the app': ['About the app', '关于应用'],
  Social: ['Social', '社交'],
  Request: ['Request', '请求'],
  'Request sent. Wait for acceptance.': [
    'Request sent. Wait for acceptance.',
    '请求已发送。请等待接受。',
  ],
  'Pending request cancelled.': [
    'Pending request cancelled.',
    '待处理请求已取消。',
  ],
  'Request conversation': ['Request conversation', '申请聊天'],
  'Request DM': ['Request DM', '申请私信'],
  'Sound changed in the interface, but the push preference was not saved. System notification silence cannot be guaranteed.':
    [
      'Sound changed in the interface, but the push preference was not saved. System notification silence cannot be guaranteed.',
      '界面声音已更改，但推送设置未保存。无法保证系统通知静音。',
    ],
  'Sound enabled, but playback is blocked by the browser or system.': [
    'Sound enabled, but playback is blocked by the browser or system.',
    '声音已启用，但浏览器或系统阻止了播放。',
  ],
  'Sound enabled, but this browser could not prepare audio.': [
    'Sound enabled, but this browser could not prepare audio.',
    '声音已启用，但此浏览器无法准备音频。',
  ],
  'Sound enabled. The browser may wait for a tap before allowing playback.': [
    'Sound enabled. The browser may wait for a tap before allowing playback.',
    '声音已启用。浏览器可能需要一次点击才允许播放。',
  ],
  'Only through my invitation link': [
    'Only through my invitation link',
    '仅通过我的邀请链接',
  ],
  'Approved contacts only': ['Approved contacts only', '仅已批准联系人'],
  'Only the owner or administrator can change the photo.': [
    'Only the owner or administrator can change the photo.',
    '仅所有者或管理员可以更换图片。',
  ],
  'Only the issuer can register this authorization.': [
    'Only the issuer can register this authorization.',
    '仅签发者可以登记此授权。',
  ],
  "Only this test's fictional package was deleted.": [
    "Only this test's fictional package was deleted.",
    '仅删除了本次测试的虚构数据包。',
  ],
  'Sounds enabled in this browser.': [
    'Sounds enabled in this browser.',
    '此浏览器已启用声音。',
  ],
  'Sounds disabled in this browser.': [
    'Sounds disabled in this browser.',
    '此浏览器已关闭声音。',
  ],
  Status: ['Status', '状态'],
  'Status opened.': ['Status opened.', '状态已打开。'],
  'Statuses accept a photo or text.': [
    'Statuses accept a photo or text.',
    '状态支持图片或文字。',
  ],
  'Active status': ['Active status', '有效状态'],
  'Statuses last 24 hours. Approved contacts can see them, subject to the exclusions below.':
    [
      'Statuses last 24 hours. Approved contacts can see them, subject to the exclusions below.',
      '状态保留 24 小时。已批准联系人可以查看，但下方排除的联系人除外。',
    ],
  'Status deleted.': ['Status deleted.', '状态已删除。'],
  'Status expired or outside the authorized audience.': [
    'Status expired or outside the authorized audience.',
    '状态已过期或不属于获授权受众。',
  ],
  'Status changed, expired or unavailable.': [
    'Status changed, expired or unavailable.',
    '状态已更改、过期或不可用。',
  ],
  'Status published.': ['Status published.', '状态已发布。'],
  'Status empty or exceeds the permitted size.': [
    'Status empty or exceeds the permitted size.',
    '状态为空或超过允许大小。',
  ],
  'Your contacts are empty. Add a wallet to save a private nickname.': [
    'Your contacts are empty. Add a wallet to save a private nickname.',
    '联系人为空。添加钱包地址以保存私密备注名。',
  ],
  'Your assessment of this case': [
    'Your assessment of this case',
    '你对此案例的评估',
  ],
  'Your account is ready on this device.': [
    'Your account is ready on this device.',
    '你的账户已在此设备上就绪。',
  ],
  'Your appeal': ['Your appeal', '你的申诉'],
  'Your profile photo': ['Your profile photo', '你的个人资料图片'],
  'Your profile photo was withheld from public view': [
    'Your profile photo was withheld from public view',
    '你的个人资料图片未公开展示',
  ],
  'Your participation is suspended.': [
    'Your participation is suspended.',
    '你的参与资格已暂停。',
  ],
  'Your post or reply was removed from public view': [
    'Your post or reply was removed from public view',
    '你的帖子或回复已从公开区域移除',
  ],
  'Your round is ready for calibration. You can close this tab; keep your Mac on and awake.':
    [
      'Your round is ready for calibration. You can close this tab; keep your Mac on and awake.',
      '本轮已准备好校准。可以关闭此标签页；请保持 Mac 开机且不休眠。',
    ],
  'Your followed communities': ['Your followed communities', '你关注的社区'],
  'Your conversations appear here after adding a contact or joining a group.': [
    'Your conversations appear here after adding a contact or joining a group.',
    '添加联系人或加入群组后，对话会显示在这里。',
  ],
  'Your lists': ['Your lists', '你的列表'],
  'Your saved posts': ['Your saved posts', '你保存的帖子'],
  'Invalid profile suggestions.': [
    'Invalid profile suggestions.',
    '个人资料建议无效。',
  ],
  'Suspend participant': ['Suspend participant', '暂停成员资格'],
  Suspensa: ['Suspended', '已暂停'],
  'Previous tag': ['Previous tag', '上一个标签'],
  'Previous tag or from link': [
    'Previous tag or from link',
    '之前的标签或链接中的标签',
  ],
  'Tag saved. Reload the community to update selectors and revisions.': [
    'Tag saved. Reload the community to update selectors and revisions.',
    '标签已保存。请重新加载社区以更新选择器和修订版本。',
  ],
  Tags: ['Tags', '标签'],
  'Tags (choose 1 to {0})': ['Tags (choose 1 to {0})', '标签（选择 1–{0} 个）'],
  'Community tags': ['Community tags', '社区标签'],
  'Tags currently unavailable.': [
    'Tags currently unavailable.',
    '标签暂时不可用。',
  ],
  'Invalid public media size.': [
    'Invalid public media size.',
    '公开媒体大小无效。',
  ],
  'Assessment screen unavailable.': [
    'Assessment screen unavailable.',
    '评估页面不可用。',
  ],
  'Collection screen unavailable.': [
    'Collection screen unavailable.',
    '采集页面不可用。',
  ],
  'Test screen incomplete.': ['Test screen incomplete.', '测试页面不完整。'],
  'Blue, Black or White theme': [
    'Blue, Black or White theme',
    '蓝色、黑色或白色主题',
  ],
  'Invalid saved theme. Using Black; choose another below.': [
    'Invalid saved theme. Using Black; choose another below.',
    '已保存主题无效。使用黑色；可在下方选择其他主题。',
  ],
  'Theme, sounds and media': ['Theme, sounds and media', '主题、声音与媒体'],
  'Try opening again': ['Try opening again', '重新尝试打开'],
  'Try loading image': ['Try loading image', '尝试加载图片'],
  'Try loading preferences': ['Try loading preferences', '尝试加载设置'],
  'Try loading video': ['Try loading video', '尝试加载视频'],
  'Try again': ['Try again', '重试'],
  'Retry publication': ['Retry publication', '重新尝试发布'],
  Text: ['Text', '文字'],
  'Text (optional)': ['Text (optional)', '文字（选填）'],
  'Reply text (optional with media)': [
    'Reply text (optional with media)',
    '回复文字（含媒体时选填）',
  ],
  'Invalid DM text.': ['Invalid DM text.', '私信文字无效。'],
  'Text and administration: {0} / {1} MB · media: {2} / {3} MB': [
    'Text and administration: {0} / {1} MB · media: {2} / {3} MB',
    '文字与管理数据：{0} / {1} MB · 媒体：{2} / {3} MB',
  ],
  'Fictional text after revocation; sender only.': [
    'Fictional text after revocation; sender only.',
    '撤销后的虚构文字；仅发送者可见。',
  ],
  'Historical text exceeds the limit.': [
    'Historical text exceeds the limit.',
    '历史文字超过限制。',
  ],
  'Text empty or over the limit.': [
    'Text empty or over the limit.',
    '文字为空或超过限制。',
  ],
  'Invalid signature type.': ['Invalid signature type.', '签名类型无效。'],
  'Invalid photo type.': ['Invalid photo type.', '图片类型无效。'],
  'Invalid message type.': ['Invalid message type.', '消息类型无效。'],
  'Unsupported backup record type.': [
    'Unsupported backup record type.',
    '不支持此备份记录类型。',
  ],
  'Invalid status type.': ['Invalid status type.', '状态类型无效。'],
  'Type: TXT\nName: {0}\nValue: {1}\nPublish and verify before {2}.': [
    'Type: TXT\nName: {0}\nValue: {1}\nPublish and verify before {2}.',
    '类型：TXT\n名称：{0}\n值：{1}\n请在 {2} 前发布并验证。',
  ],
  Title: ['Title', '标题'],
  'All handle messages and requests': [
    'All handle messages and requests',
    '全部用户名私信与请求',
  ],
  'All tags': ['All tags', '全部标签'],
  'All history': ['All history', '全部历史'],
  'All skin tones': ['All skin tones', '全部肤色'],
  'Tap Open {0}, connect and sign. Return to this browser to confirm the address.':
    [
      'Tap Open {0}, connect and sign. Return to this browser to confirm the address.',
      '请点击“打开 {0}”，连接并签名。然后返回此浏览器确认地址。',
    ],
  'Make administrator': ['Make administrator', '设为管理员'],
  'Make member': ['Make member', '设为普通成员'],
  'Transfer awaiting @{0}.': [
    'Transfer awaiting @{0}.',
    '转让等待 @{0} 接受。',
  ],
  'Community transfer awaiting you': [
    'Community transfer awaiting you',
    '社区转让等待你接受',
  ],
  'Transfer to you': ['Transfer to you', '向你转让'],
  Transfers: ['Transfers', '转让'],
  'Community transfers': ['Community transfers', '社区转让'],
  Trending: ['Trending', '热门'],
  'Change banner': ['Change banner', '更换横幅'],
  'Replace invitation': ['Replace invitation', '更换邀请'],
  'Change photo': ['Change photo', '更换图片'],
  All: ['All', '全部'],
  'Everything on: online status, read receipts, GIFs and full alerts.': [
    'Everything on: online status, read receipts, GIFs and full alerts.',
    '全部开启：在线状态、已读回执、GIF 和完整通知。',
  ],
  'Invalid TURN.': ['Invalid TURN.', 'TURN 无效。'],
  'TURN did not respond in time.': [
    'TURN did not respond in time.',
    'TURN 未及时响应。',
  ],
  "App's own TURN server unavailable.": [
    "App's own TURN server unavailable.",
    '应用自有 TURN 服务器不可用。',
  ],
  'TXT: _0xdmme.{0}\nValue: {1}': [
    'TXT: _0xdmme.{0}\nValue: {1}',
    'TXT: _0xdmme.{0}\n值：{1}',
  ],
  'A contact still needs to open Conversations to prepare their account.': [
    'A contact still needs to open Conversations to prepare their account.',
    '有联系人仍需打开“对话”以准备账户。',
  ],
  'One appeal per sanction, visible to managers.': [
    'One appeal per sanction, visible to managers.',
    '每项处罚可申诉一次，管理员可见。',
  ],
  'Video upload is not available yet.': [
    'Video upload is not available yet.',
    '视频上传尚不可用。',
  ],
  'trending upvotes': ['trending upvotes', '点赞趋势上升'],
  'Use this QR code or code only on your other device.': [
    'Use this QR code or code only on your other device.',
    '请仅在你自己的另一台设备上使用此二维码或代码。',
  ],
  'Use PNG, JPEG or WebP images no larger than 8 MiB each.': [
    'Use PNG, JPEG or WebP images no larger than 8 MiB each.',
    '请使用每张不超过 8 MiB 的 PNG、JPEG 或 WebP 图片。',
  ],
  'Use an authorized device to approve.': [
    'Use an authorized device to approve.',
    '请使用已授权设备批准。',
  ],
  'Use a valid PNG, JPEG or WebP photo.': [
    'Use a valid PNG, JPEG or WebP photo.',
    '请使用有效的 PNG、JPEG 或 WebP 图片。',
  ],
  'Use a compatible PNG, JPEG or WebP image in this DM.': [
    'Use a compatible PNG, JPEG or WebP image in this DM.',
    '请在此私信中使用兼容的 PNG、JPEG 或 WebP 图片。',
  ],
  'Storage usage, save and restore': [
    'Storage usage, save and restore',
    '存储用量、保存与恢复',
  ],
  User: ['User', '用户'],
  Users: ['Users', '用户'],
  'Users and communities': ['Users and communities', '用户与社区'],
  'Valid until': ['Valid until', '有效期至'],
  'Validating and importing encrypted history…': [
    'Validating and importing encrypted history…',
    '正在验证并导入加密历史…',
  ],
  View: ['View', '查看'],
  'View the list of {0} communities': [
    'View the list of {0} communities',
    '查看 {0} 个社区列表',
  ],
  'View analysis and appeal': ['View analysis and appeal', '查看分析并申诉'],
  'View original image': ['View original image', '查看原始图片'],
  'View more': ['View more', '查看更多'],
  'View less': ['View less', '收起'],
  'View my prepared media (restricted)': [
    'View my prepared media (restricted)',
    '查看我的已处理媒体（受限）',
  ],
  'View names': ['View names', '查看名称'],
  'All handle messages': ['All handle messages', '全部用户名私信'],
  'DM conversation not confirmed.': [
    'DM conversation not confirmed.',
    '私信会话尚未确认。',
  ],
  'DM requests have been disabled. Use Block to prevent messages.': [
    'DM requests have been disabled. Use Block to prevent messages.',
    '私信申请已停用。请使用屏蔽来阻止消息。',
  ],
  'View other comments': ['View other comments', '查看其他评论'],
  'View public profile': ['View public profile', '查看公开个人资料'],
  'View full post': ['View full post', '查看完整帖子'],
  'View published reply': ['View published reply', '查看已发布回复'],
  'View mutual followers': ['View mutual followers', '查看共同关注者'],
  "View {0}'s status": ["View {0}'s status", '查看 {0} 的状态'],
  'View all': ['View all', '查看全部'],
  'domain verification outdated or inconclusive': [
    'domain verification outdated or inconclusive',
    '域名验证已过时或结果不确定',
  ],
  'Recovery verification failed.': [
    'Recovery verification failed.',
    '恢复验证失败。',
  ],
  'Verify authorization': ['Verify authorization', '核验授权'],
  'Verify DNS': ['Verify DNS', '验证 DNS'],
  'Verify again before using this authorization.': [
    'Verify again before using this authorization.',
    '使用此授权前请重新核验。',
  ],
  'Previous version invalid for this edit.': [
    'Previous version invalid for this edit.',
    '先前版本不适用于此次编辑。',
  ],
  'Version missing.': ['Version missing.', '缺少版本。'],
  'Contact version not loaded.': [
    'Contact version not loaded.',
    '联系人版本未加载。',
  ],
  'Invalid test version.': ['Invalid test version.', '测试版本无效。'],
  'Version removed from the personal vault. Check the independent backup.': [
    'Version removed from the personal vault. Check the independent backup.',
    '版本已从个人保险库中移除。请查阅独立备份。',
  ],
  'Version, updates, source code and licenses': [
    'Version, updates, source code and licenses',
    '版本、更新、源代码与许可证',
  ],
  'Loaded versions: {0}': ['Loaded versions: {0}', '已加载版本：{0}'],
  'Travel and places': ['Travel and places', '旅行与地点'],
  'YouTube video': ['YouTube video', 'YouTube 视频'],
  'Video uploaded. Background analysis pending.': [
    'Video uploaded. Background analysis pending.',
    '视频已上传。等待后台分析。',
  ],
  'Video unavailable. Try again.': [
    'Video unavailable. Try again.',
    '视频不可用。请重试。',
  ],
  'Active — acceptance verified': [
    'Active — acceptance verified',
    '有效 — 已核验接受记录',
  ],
  'Active — awaiting acceptance': [
    'Active — awaiting acceptance',
    '有效 — 等待接受',
  ],
  'Link, recover and manage access': [
    'Link, recover and manage access',
    '关联、恢复与管理访问',
  ],
  'Link/verify domain (optional)': [
    'Link/verify domain (optional)',
    '关联/验证域名（选填）',
  ],
  'Device binding missing.': ['Device binding missing.', '缺少设备绑定。'],
  'Domain binding does not match.': [
    'Domain binding does not match.',
    '域名绑定不匹配。',
  ],
  'Matrix binding missing.': ['Matrix binding missing.', '缺少 Matrix 绑定。'],
  'Key bindings missing.': ['Key bindings missing.', '缺少密钥绑定。'],
  'Group bindings missing.': ['Group bindings missing.', '缺少群组绑定。'],
  Overview: ['Overview', '概览'],
  'Visibility applied on the server. Previously approved contacts were preserved.':
    [
      'Visibility applied on the server. Previously approved contacts were preserved.',
      '可见性已在服务器上应用。先前已批准联系人已保留。',
    ],
  'Seen by recipients who share read receipts': [
    'Seen by recipients who share read receipts',
    '已由开启已读回执的接收者查看',
  ],
  views: ['views', '次浏览'],
  You: ['You', '你'],
  'You have not created a public profile yet.': [
    'You have not created a public profile yet.',
    '你尚未创建公开个人资料。',
  ],
  'You joined the group.': ['You joined the group.', '你已加入群组。'],
  'You are {0} your data with {1}. Only confirm the request you opened in your browser. Then return to it.':
    [
      'You are {0} your data with {1}. Only confirm the request you opened in your browser. Then return to it.',
      '你正在使用 {1} {0}你的数据。请仅确认自己在浏览器中发起的请求，然后返回该浏览器。',
    ],
  'You cannot post in this community. Check whether it is archived or your participation is restricted.':
    [
      'You cannot post in this community. Check whether it is archived or your participation is restricted.',
      '你无法在此社区发帖。请检查社区是否已归档，或你的参与资格是否受限。',
    ],
  'You have no sent requests on this page.': [
    'You have no sent requests on this page.',
    '此页面没有你发送的请求。',
  ],
  Back: ['Back', '返回'],
  'Back to Activity': ['Back to Activity', '返回活动'],
  'Back to start': ['Back to start', '返回开始'],
  'Voting unavailable in this community.': [
    'Voting unavailable in this community.',
    '此社区无法投票。',
  ],
  'Upvote; tap again to remove your vote': [
    'Upvote; tap again to remove your vote',
    '点赞；再次点击撤回',
  ],
  'Downvote; tap again to remove your vote': [
    'Downvote; tap again to remove your vote',
    '点踩；再次点击撤回',
  ],
  'Post votes': ['Post votes', '帖子投票'],
  'Wallet {0}: {1}': ['Wallet {0}: {1}', '钱包 {0}：{1}'],
  'Wallet {0}: {1}{2}{3}': ['Wallet {0}: {1}{2}{3}', '钱包 {0}：{1}{2}{3}'],
  'Wallet not loaded in the list yet.': [
    'Wallet not loaded in the list yet.',
    '钱包尚未加载到列表中。',
  ],
  'Wallet changed.': ['Wallet changed.', '钱包已更改。'],
  'Blocked wallet': ['Blocked wallet', '已屏蔽钱包'],
  'Wallet address copied.': ['Wallet address copied.', '钱包地址已复制。'],
  'Wallet and provided name': ['Wallet and provided name', '钱包与提供的名称'],
  'Wallet unavailable in this browser. Open a compatible wallet to sign.': [
    'Wallet unavailable in this browser. Open a compatible wallet to sign.',
    '此浏览器中的钱包不可用。请打开兼容钱包以签名。',
  ],
  'Wallet unavailable for requests by address. Save it in contacts and share your invitation.':
    [
      'Wallet unavailable for requests by address. Save it in contacts and share your invitation.',
      '无法按此钱包地址申请聊天。请保存到联系人并分享邀请。',
    ],
  'Wallet unavailable.': ['Wallet unavailable.', '钱包不可用。'],
  'Wallet unavailable in this in-app browser. Reopen the request in the original browser.':
    [
      'Wallet unavailable in this in-app browser. Reopen the request in the original browser.',
      '此内置浏览器中的钱包不可用。请在原浏览器中重新打开请求。',
    ],
  "Selected wallet changed. Check the active package's source account and test again.":
    [
      "Selected wallet changed. Check the active package's source account and test again.",
      '所选钱包已更改。请核对当前数据包的来源账户并重新测试。',
    ],
  'Wallet lacks the required capability.': [
    'Wallet lacks the required capability.',
    '钱包不支持所需功能。',
  ],
  'Incompatible WASM': ['Incompatible WASM', 'WASM 不兼容'],
  'Worker unavailable in this browser.': [
    'Worker unavailable in this browser.',
    '此浏览器中的工作线程不可用。',
  ],
  'App language': ['App language', '应用语言'],
  'Save language': ['Save language', '保存语言'],
  'Could not save your language.': [
    'Could not save your language.',
    '无法保存语言设置。',
  ],
  'Open your account to save your language.': [
    'Open your account to save your language.',
    '请打开账户以保存语言设置。',
  ],
  'Invalid language preference.': [
    'Invalid language preference.',
    '语言设置无效。',
  ],
  'html.7eb60c98aba6': [
    '<article class="card"><h2>Presence and read receipts</h2><form data-privacy-preferences><label><input type="checkbox" name="online"> Show online status to approved contacts</label><label><input type="checkbox" name="readReceipts"> Send read receipts</label><p>These choices apply to your account. Confirm to apply them.</p><button class="primary" type="submit">Confirm changes</button></form><p data-privacy-status role="status"></p></article>',
    '<article class="card"><h2>在线状态与已读回执</h2><form data-privacy-preferences><label><input type="checkbox" name="online"> 向已批准联系人显示在线状态</label><label><input type="checkbox" name="readReceipts"> 发送已读回执</label><p>这些选项适用于你的账户。请确认以应用。</p><button class="primary" type="submit">确认更改</button></form><p data-privacy-status role="status"></p></article>',
  ],
  'html.6c0fbe0bf86d': [
    '<article class="card account-card"><span class="eyebrow">WALLET ACCOUNT</span><h2 data-account-title>Your profile on 0xDMme</h2>\n<p data-account-intro>Sign in with your wallet or link this device in Profile → Devices. Access signatures do not move funds.</p>\n<button class="primary" type="button" data-wallet-approve hidden>Confirm signature</button>\n<button class="primary" type="button" data-wallet-picker-toggle aria-expanded="false" aria-controls="wallet-picker">Connect wallet</button>\n<section id="wallet-picker" class="wallet-picker" data-wallet-picker hidden aria-label="Choose wallet">\n<div data-wallet-brands><h3>Choose your wallet</h3><p class="detail">Detection indicates availability in this browser. In mobile Chrome/Safari, choose the app you installed; it may not be detected here.</p>\n<div class="wallet-options"><button type="button" class="wallet-option" data-wallet-brand="MetaMask"><span>MetaMask</span><span class="wallet-detection" data-brand-detection="MetaMask">Not detected</span></button>\n<button type="button" class="wallet-option" data-wallet-brand="Phantom"><span>Phantom</span><span class="wallet-detection" data-brand-detection="Phantom">Not detected</span></button>\n<button type="button" class="wallet-option" data-wallet-brand="Backpack"><span>Backpack</span><span class="wallet-detection" data-brand-detection="Backpack">Not detected</span></button></div>\n<div data-other-wallets class="wallet-options"></div></div>\n<div data-wallet-networks hidden><button type="button" data-wallet-picker-back>← Change wallet</button><h3 data-wallet-network-title></h3><p class="detail">Choose the account\'s ecosystem.</p>\n<div class="wallet-options"><button type="button" class="wallet-option" data-wallet="MetaMask" data-network-brand="MetaMask"><span>EVM</span><span class="wallet-detection" data-detection="MetaMask">Not detected</span></button>\n<button type="button" class="wallet-option" data-wallet="MetaMask:solana" data-network-brand="MetaMask"><span>Solana</span><span class="wallet-detection" data-detection="MetaMask:solana">Not detected</span></button>\n<button type="button" class="wallet-option" data-wallet="Phantom" data-network-brand="Phantom"><span>EVM</span><span class="wallet-detection" data-detection="Phantom">Not detected</span></button>\n<button type="button" class="wallet-option" data-wallet="Phantom:solana" data-network-brand="Phantom"><span>Solana</span><span class="wallet-detection" data-detection="Phantom:solana">Not detected</span></button>\n<button type="button" class="wallet-option" data-wallet="Backpack:solana" data-network-brand="Backpack"><span>Solana</span><span class="wallet-detection" data-detection="Backpack:solana">Not detected</span></button>\n<button type="button" class="wallet-option" data-wallet="Backpack" data-network-brand="Backpack"><span>EVM</span><span class="wallet-detection" data-detection="Backpack">Not detected</span></button></div>\n<div data-other-wallet-networks class="wallet-options"></div></div>\n<p class="detail">On mobile, selecting an ecosystem attempts to open your wallet for signing. Return to this browser to confirm the address. EVM and Solana are separate accounts.</p></section>\n<p data-wallet-purpose hidden>Only sign if you opened this request in your browser. It will connect that browser to your account; reject links sent by other people.</p>\n<div data-wallet-return hidden><a data-wallet-open referrerpolicy="no-referrer">Open wallet</a><p data-wallet-candidate></p><button data-wallet-confirm type="button" hidden>Confirm this address in this browser</button><button data-wallet-cancel type="button">Cancel request</button></div>\n<p class="detail" data-wallet-manual hidden>Use your phone\'s recent apps screen to return to the original browser. The request is only confirmed as signed when this page says so.</p>\n<p data-account-status role="status">Checking session…</p><button data-account-finish type="button" hidden>Complete sign-in</button>\n<details data-wallet-diagnostics hidden open><summary>Sign-in diagnostics</summary><p class="detail" data-wallet-diagnostic></p><p class="detail">If it fails, send this line. It contains no ticket, address or signature.</p></details>\n<div data-profile hidden><div class="profile-identity"><button class="profile-avatar" data-profile-avatar type="button" aria-label="Change profile photo">#</button><div><strong data-profile-name></strong><p data-account-address class="account-address"></p><div class="settings-actions"><button data-profile-copy type="button">Copy wallet</button><button data-logout type="button" aria-label="Sign out">Sign out</button></div></div></div>\n<details class="settings-section" data-settings-section="account"><summary><span class="settings-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4 16 12-12 4 4-12 12H4zM13 7l4 4"/></svg></span><span><strong>Edit profile</strong><small>Name, photo and backup reminder</small></span><span class="settings-chevron" aria-hidden="true">⌄</span></summary><div class="settings-body">\n<form data-name-form><label>Name shown in contact requests<input name="display-name" maxlength="80" autocomplete="nickname"></label><button class="primary" type="submit">Confirm changes</button></form>\n<div data-private-profile hidden><p data-photo-draft-status></p><button type="button" data-private-photo-remove>Remove photo</button><h3>Preferences</h3>\n<form data-preferences><label><input type="checkbox" name="backupReminder"> Remind me to save a backup every seven days</label><button class="primary" type="submit">Confirm changes</button></form></div>\n</div></details><p data-profile-status role="status"></p></div></article>',
    '<article class="card account-card"><span class="eyebrow">钱包账户</span><h2 data-account-title>你的 0xDMme 个人资料</h2>\n<p data-account-intro>请使用钱包登录，或在“个人资料 → 设备”中关联此设备。访问签名不会转移资金。</p>\n<button class="primary" type="button" data-wallet-approve hidden>确认签名</button>\n<button class="primary" type="button" data-wallet-picker-toggle aria-expanded="false" aria-controls="wallet-picker">连接钱包</button>\n<section id="wallet-picker" class="wallet-picker" data-wallet-picker hidden aria-label="选择钱包">\n<div data-wallet-brands><h3>选择钱包</h3><p class="detail">检测结果仅表示钱包在此浏览器中可用。在手机 Chrome/Safari 中，请选择你已安装的应用；这里可能无法检测到它。</p>\n<div class="wallet-options"><button type="button" class="wallet-option" data-wallet-brand="MetaMask"><span>MetaMask</span><span class="wallet-detection" data-brand-detection="MetaMask">未检测到</span></button>\n<button type="button" class="wallet-option" data-wallet-brand="Phantom"><span>Phantom</span><span class="wallet-detection" data-brand-detection="Phantom">未检测到</span></button>\n<button type="button" class="wallet-option" data-wallet-brand="Backpack"><span>Backpack</span><span class="wallet-detection" data-brand-detection="Backpack">未检测到</span></button></div>\n<div data-other-wallets class="wallet-options"></div></div>\n<div data-wallet-networks hidden><button type="button" data-wallet-picker-back>← 更换钱包</button><h3 data-wallet-network-title></h3><p class="detail">请选择账户生态系统。</p>\n<div class="wallet-options"><button type="button" class="wallet-option" data-wallet="MetaMask" data-network-brand="MetaMask"><span>EVM</span><span class="wallet-detection" data-detection="MetaMask">未检测到</span></button>\n<button type="button" class="wallet-option" data-wallet="MetaMask:solana" data-network-brand="MetaMask"><span>Solana</span><span class="wallet-detection" data-detection="MetaMask:solana">未检测到</span></button>\n<button type="button" class="wallet-option" data-wallet="Phantom" data-network-brand="Phantom"><span>EVM</span><span class="wallet-detection" data-detection="Phantom">未检测到</span></button>\n<button type="button" class="wallet-option" data-wallet="Phantom:solana" data-network-brand="Phantom"><span>Solana</span><span class="wallet-detection" data-detection="Phantom:solana">未检测到</span></button>\n<button type="button" class="wallet-option" data-wallet="Backpack:solana" data-network-brand="Backpack"><span>Solana</span><span class="wallet-detection" data-detection="Backpack:solana">未检测到</span></button>\n<button type="button" class="wallet-option" data-wallet="Backpack" data-network-brand="Backpack"><span>EVM</span><span class="wallet-detection" data-detection="Backpack">未检测到</span></button></div>\n<div data-other-wallet-networks class="wallet-options"></div></div>\n<p class="detail">在手机上选择生态系统后，会尝试打开钱包以签名。请返回此浏览器确认地址。EVM 和 Solana 使用不同账户。</p></section>\n<p data-wallet-purpose hidden>请仅在你自己于浏览器中发起此请求时签名。签名会将该浏览器连接到你的账户；请拒绝他人发来的链接。</p>\n<div data-wallet-return hidden><a data-wallet-open referrerpolicy="no-referrer">打开钱包</a><p data-wallet-candidate></p><button data-wallet-confirm type="button" hidden>在此浏览器中确认此地址</button><button data-wallet-cancel type="button">取消请求</button></div>\n<p class="detail" data-wallet-manual hidden>请通过手机最近使用的应用界面返回原浏览器。只有此页面显示已确认时，才表示请求签名完成。</p>\n<p data-account-status role="status">正在检查会话…</p><button data-account-finish type="button" hidden>完成登录</button>\n<details data-wallet-diagnostics hidden open><summary>登录诊断</summary><p class="detail" data-wallet-diagnostic></p><p class="detail">如果失败，请发送此行。它不包含请求凭证、地址或签名。</p></details>\n<div data-profile hidden><div class="profile-identity"><button class="profile-avatar" data-profile-avatar type="button" aria-label="更换个人资料图片">#</button><div><strong data-profile-name></strong><p data-account-address class="account-address"></p><div class="settings-actions"><button data-profile-copy type="button">复制钱包地址</button><button data-logout type="button" aria-label="退出登录">退出登录</button></div></div></div>\n<details class="settings-section" data-settings-section="account"><summary><span class="settings-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4 16 12-12 4 4-12 12H4zM13 7l4 4"/></svg></span><span><strong>编辑个人资料</strong><small>名称、图片与备份提醒</small></span><span class="settings-chevron" aria-hidden="true">⌄</span></summary><div class="settings-body">\n<form data-name-form><label>联系人请求中显示的名称<input name="display-name" maxlength="80" autocomplete="nickname"></label><button class="primary" type="submit">确认更改</button></form>\n<div data-private-profile hidden><p data-photo-draft-status></p><button type="button" data-private-photo-remove>移除图片</button><h3>偏好设置</h3>\n<form data-preferences><label><input type="checkbox" name="backupReminder"> 每七天提醒保存备份</label><button class="primary" type="submit">确认更改</button></form></div>\n</div></details><p data-profile-status role="status"></p></div></article>',
  ],
  'html.5ee9df8dde64': [
    '<h2>Notifications on this device</h2><p>Your account receives push notifications. Enable them here too for message and call alerts.</p><p data-push-offer-status role="status"></p><div class="settings-actions"><button type="button" data-push-offer-later>Not now</button><button type="button" class="primary" data-push-offer-enable>Enable notifications</button></div>',
    '<h2>此设备上的通知</h2><p>你的账户已接收推送通知。请在此设备上也启用，以接收消息与来电通知。</p><p data-push-offer-status role="status"></p><div class="settings-actions"><button type="button" data-push-offer-later>暂时跳过</button><button type="button" class="primary" data-push-offer-enable>启用通知</button></div>',
  ],
  'html.91580e468fc5': [
    '<section data-wizard-step="result" hidden><h2>Initial settings</h2><p data-wizard-result role="status"></p><ul data-wizard-problems></ul><div class="settings-actions"><button type="button" class="primary" data-wizard-close>Close</button></div></section>',
    '<section data-wizard-step="result" hidden><h2>初始设置</h2><p data-wizard-result role="status"></p><ul data-wizard-problems></ul><div class="settings-actions"><button type="button" class="primary" data-wizard-close>关闭</button></div></section>',
  ],
  'html.0930613867e2': [
    '<form data-wizard-step="review" hidden><h2>Review your settings</h2><p>Applies to your account on all devices.</p>\n<fieldset><legend>Appearance</legend><div class="settings-pack-themes">{0}</div></fieldset>\n<fieldset><legend>Privacy</legend><label>Who can request a conversation<select name="discovery">{1}</select></label><label><input type="checkbox" name="online"> Show online status to approved contacts</label><label><input type="checkbox" name="readReceipts"> Send read receipts</label></fieldset>\n<fieldset><legend>External media</legend><label><input type="checkbox" name="externalMedia"> Show GIFs and external videos</label><small data-wizard-media></small></fieldset>\n<fieldset><legend>Notifications</legend><label><input type="checkbox" name="pushEnabled"> Receive push notifications</label><div class="settings-pack-push"><label><input type="checkbox" name="messages"> Messages and replies</label><label><input type="checkbox" name="calls"> Calls</label><label><input type="checkbox" name="showCalls"> Identify the alert as a voice call</label></div><small>When saving, your browser asks for notification permission. The contact\'s name is never shown.</small><label><input type="checkbox" name="sound"> In-app sounds</label></fieldset>\n<fieldset><legend>Backup</legend><label><input type="checkbox" name="backupReminder"> Remind me to save a backup every seven days</label></fieldset>\n<div class="settings-actions"><button type="button" data-wizard-back>Back</button><button type="submit" class="primary">Save and get started</button></div></form>',
    '<form data-wizard-step="review" hidden><h2>检查设置</h2><p>适用于你账户的所有设备。</p>\n<fieldset><legend>外观</legend><div class="settings-pack-themes">{0}</div></fieldset>\n<fieldset><legend>隐私</legend><label>谁可以申请聊天<select name="discovery">{1}</select></label><label><input type="checkbox" name="online"> 向已批准联系人显示在线状态</label><label><input type="checkbox" name="readReceipts"> 发送已读回执</label></fieldset>\n<fieldset><legend>外部媒体</legend><label><input type="checkbox" name="externalMedia"> 显示 GIF 和外部视频</label><small data-wizard-media></small></fieldset>\n<fieldset><legend>通知</legend><label><input type="checkbox" name="pushEnabled"> 接收推送通知</label><div class="settings-pack-push"><label><input type="checkbox" name="messages"> 消息与回复</label><label><input type="checkbox" name="calls"> 通话</label><label><input type="checkbox" name="showCalls"> 将通知标识为语音来电</label></div><small>保存时，浏览器会请求通知权限。通知不会显示联系人的姓名。</small><label><input type="checkbox" name="sound"> 应用内声音</label></fieldset>\n<fieldset><legend>备份</legend><label><input type="checkbox" name="backupReminder"> 每七天提醒保存备份</label></fieldset>\n<div class="settings-actions"><button type="button" data-wizard-back>返回</button><button type="submit" class="primary">保存并开始</button></div></form>',
  ],
  'html.12c90e74741c': [
    '<section data-wizard-step="choose"><h2>Initial settings</h2><p>Choose a starting point. Review every option before saving; you can change everything later in Profile.</p><div class="settings-pack-presets">{0}</div><div class="settings-actions"><button type="button" data-wizard-skip>Not now</button></div></section>',
    '<section data-wizard-step="choose"><h2>初始设置</h2><p>选择一组初始设置。保存前可逐项检查，之后可在“个人资料”中更改所有设置。</p><div class="settings-pack-presets">{0}</div><div class="settings-actions"><button type="button" data-wizard-skip>暂时跳过</button></div></section>',
  ],
  ' hidden by moderation.': [' hidden by moderation.', ' 已被审核隐藏。'],
  ' deleted by the author.': [' deleted by the author.', ' 已被作者删除。'],
  'html.6b9c4f752db1': [
    '<div class="public-chat-bar"><span>Message via @</span><button data-chat-collapse class="icon-button" type="button" aria-label="Collapse conversation" title="Collapse conversation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H9M13 7l-5 5 5 5M4 5v14"/></svg></button></div><div class="public-chat-body"></div>',
    '<div class="public-chat-bar"><span>通过 @ 发送消息</span><button data-chat-collapse class="icon-button" type="button" aria-label="收起对话" title="收起对话"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H9M13 7l-5 5 5 5M4 5v14"/></svg></button></div><div class="public-chat-body"></div>',
  ],
  'html.148d3089e900': [
    '<section class="profile-settings" aria-label="Account settings"><h2>Settings</h2><p class="settings-intro">Open the category you want to adjust.</p>\n{0}\n{1}\n{2}\n{3}\n{4}\n{5}\n{6}\n{7}\n<div class="profile-content-links"><button type="button" data-open-section="account">Edit profile</button><a href="#status">My status</a><a href="#contacts">Contacts</a></div></section>',
    '<section class="profile-settings" aria-label="账户设置"><h2>设置</h2><p class="settings-intro">打开需要调整的设置类别。</p>\n{0}\n{1}\n{2}\n{3}\n{4}\n{5}\n{6}\n{7}\n<div class="profile-content-links"><button type="button" data-open-section="account">编辑个人资料</button><a href="#status">我的状态</a><a href="#contacts">联系人</a></div></section>',
  ],
  'html.33d7dbf67efc': [
    '<article class="card"><p id="pwa-state" role="status">Checking for updates…</p><button id="check-updates" type="button">Check for updates</button></article><nav class="about-app-links" aria-label="Source code and licenses" data-about-links></nav>',
    '<article class="card"><p id="pwa-state" role="status">正在检查更新…</p><button id="check-updates" type="button">检查更新</button></article><nav class="about-app-links" aria-label="源代码与许可证" data-about-links></nav>',
  ],
  'html.422549a13d64': [
    '<fieldset class="appearance-options"><legend>Theme</legend>{0}</fieldset><p class="appearance-feedback" role="status"></p><p class="settings-test-note">When signed in, the theme follows your account across devices.</p>',
    '<fieldset class="appearance-options"><legend>主题</legend>{0}</fieldset><p class="appearance-feedback" role="status"></p><p class="settings-test-note">登录后，主题将随账户同步到各设备。</p>',
  ],
  'html.eedc51d31423': [
    '<article class="card"><h2>Local backup</h2><p>Keep a full encrypted copy. Importing a file adds its history to this device\'s conversations.</p><p data-backup-status role="status"></p><button data-backup-save class="primary" type="button">Save backup file</button><a data-backup-download hidden>Download prepared file</a><button data-backup-validate type="button">Validate file</button><input data-backup-file type="file" accept=".0xdm,application/octet-stream" hidden><button data-backup-cancel type="button" hidden>Cancel</button><section class="settings-danger"><h3>Danger zone</h3><p>Available after you validate a backup file: removes from your server vault only what that file preserves, after confirmation. Later messages and other people\'s copies remain.</p><button data-backup-clean type="button" disabled>Reset vault</button></section></article>',
    '<article class="card"><h2>本地备份</h2><p>保留完整的加密副本。导入文件会将历史加入此设备的对话中。</p><p data-backup-status role="status"></p><button data-backup-save class="primary" type="button">保存备份文件</button><a data-backup-download hidden>下载已处理文件</a><button data-backup-validate type="button">验证文件</button><input data-backup-file type="file" accept=".0xdm,application/octet-stream" hidden><button data-backup-cancel type="button" hidden>取消</button><section class="settings-danger"><h3>危险操作</h3><p>验证备份文件后可用：确认后，仅从服务器保险库中移除该文件已保存的内容。之后的消息和其他人的副本会保留。</p><button data-backup-clean type="button" disabled>重置保险库</button></section></article>',
  ],
  'html.dc84c57fff55': [
    '<article class="card call-settings"><h2>Voice calls</h2><p>Receive calls from approved contacts while the app is open and connected. Muted or archived conversations do not ring. No call history is kept.</p><button data-call-toggle type="button" aria-pressed="true">Disable incoming calls</button><p data-call-status role="status"></p></article>',
    '<article class="card call-settings"><h2>语音通话</h2><p>应用打开并联网时，可以接听已批准联系人的来电。静音或归档对话不会响铃。不会保留通话历史。</p><button data-call-toggle type="button" aria-pressed="true">关闭来电</button><p data-call-status role="status"></p></article>',
  ],
  'html.46729037ae98': [
    '<form data-{0} class="chat-composer">\n    {1}\n    <div class="compose-preview"><div data-attachment-preview></div><button data-attachment-clear class="chat-icon" type="button" aria-label="Remove attachment" title="Remove attachment" hidden>{2}</button></div>\n    <p data-voice-status class="compose-notice" role="status"></p>\n    <div class="voice-recorder"><button data-voice-cancel class="chat-icon" type="button" aria-label="Cancel recording" title="Cancel recording" hidden>{3}</button><span class="voice-rec-dot" aria-hidden="true"></span><span data-voice-clock class="voice-rec-clock">0:00</span><span class="voice-rec-limit">/ 1:30</span><span class="voice-rec-hint">Release to review</span><button data-voice-stop class="chat-icon compose-primary" type="button" aria-label="Stop and review" title="Stop and review" hidden>{4}</button></div>\n    <div class="compose-row">\n      <div class="compose-input">\n        <button data-{5}-emoji class="chat-icon" type="button" aria-label="Choose emoji" title="Choose emoji">{6}</button>\n        <textarea data-{7}-text rows="1" aria-label="Message" placeholder="Message…"></textarea>\n        <button data-chat-attachment type="button" class="chat-icon" aria-label="Attach photo or file" title="{11}">{8}</button>\n      </div>\n      <button data-voice-record class="chat-icon compose-primary" type="button" aria-label="Record voice message" title="Record voice">{9}</button>\n      <button data-compose-send class="chat-icon compose-primary" type="submit" aria-label="Send message" title="Send" hidden>{10}</button>\n    </div>\n    <input data-attachment-file type="file" aria-label="Photo or file" hidden>\n  </form>',
    '<form data-{0} class="chat-composer">\n    {1}\n    <div class="compose-preview"><div data-attachment-preview></div><button data-attachment-clear class="chat-icon" type="button" aria-label="移除附件" title="移除附件" hidden>{2}</button></div>\n    <p data-voice-status class="compose-notice" role="status"></p>\n    <div class="voice-recorder"><button data-voice-cancel class="chat-icon" type="button" aria-label="取消录音" title="取消录音" hidden>{3}</button><span class="voice-rec-dot" aria-hidden="true"></span><span data-voice-clock class="voice-rec-clock">0:00</span><span class="voice-rec-limit">/ 1:30</span><span class="voice-rec-hint">松开以检查</span><button data-voice-stop class="chat-icon compose-primary" type="button" aria-label="停止并检查" title="停止并检查" hidden>{4}</button></div>\n    <div class="compose-row">\n      <div class="compose-input">\n        <button data-{5}-emoji class="chat-icon" type="button" aria-label="选择表情" title="选择表情">{6}</button>\n        <textarea data-{7}-text rows="1" aria-label="消息" placeholder="消息…"></textarea>\n        <button data-chat-attachment type="button" class="chat-icon" aria-label="附加图片或文件" title="{11}">{8}</button>\n      </div>\n      <button data-voice-record class="chat-icon compose-primary" type="button" aria-label="录制语音消息" title="录制语音">{9}</button>\n      <button data-compose-send class="chat-icon compose-primary" type="submit" aria-label="发送消息" title="发送" hidden>{10}</button>\n    </div>\n    <input data-attachment-file type="file" aria-label="图片或文件" hidden>\n  </form>',
  ],
  'html.2e7c749dbe8a': [
    '<div data-compose-bar class="compose-context" hidden><p data-compose-context></p><button data-compose-cancel class="chat-icon" type="button" aria-label="Cancel reply or edit">{0}</button></div>',
    '<div data-compose-bar class="compose-context" hidden><p data-compose-context></p><button data-compose-cancel class="chat-icon" type="button" aria-label="取消回复或编辑">{0}</button></div>',
  ],
  'html.266effed7cb6': [
    '<button data-chat-collapse class="chat-icon chat-collapse" type="button" aria-label="Collapse conversation" title="Collapse conversation">{0}</button>',
    '<button data-chat-collapse class="chat-icon chat-collapse" type="button" aria-label="收起对话" title="收起对话">{0}</button>',
  ],
  'html.3b20f44af6d9': [
    '<article class="card chat-panel">\n    <div class="chat-welcome">{5}<h2>Let\'s chat?</h2><p>Choose a conversation from the menu.</p></div>\n    <div class="chat-feedback"><p data-message-status role="status"></p><details class="chat-options"><summary>Connection</summary><div class="chat-popover"><p data-message-live role="status"></p><button data-message-refresh type="button">{10}Sync now</button></div></details></div>\n    <div class="chat-layout"><section data-direct-conversation class="chat-conversation">\n      <header class="chat-header"><button data-chat-back class="chat-icon chat-mobile-back" type="button" aria-label="Back to conversations">{0}</button><button data-chat-avatar class="chat-peer-avatar" type="button" disabled aria-label="Zoom in on image">#</button><div class="chat-peer"><h3 data-message-peer></h3><p data-peer-presence></p></div><button data-call-start class="chat-icon" type="button" aria-label="Voice call" title="Voice call">{1}</button><details class="chat-options"><summary class="chat-icon" aria-label="Conversation options" title="Conversation options">{2}</summary><div class="chat-popover"><button data-chat-edit-contact type="button">{7}Edit contact</button><details><summary>{8}Representative authorizations</summary><div data-representative-chat></div></details><a href="#settings">{9}Profile and settings</a></div></details>{3}</header>\n      <div class="chat-thread">{6}<p data-message-gate class="chat-gate" role="status"></p><button data-message-older class="chat-older" type="button" hidden>Earlier messages</button><div data-message-history class="chat-history" tabindex="0" aria-label="Conversation messages" hidden></div><ul data-message-pending class="chat-pending" aria-label="Pending sends on this device"></ul></div>\n      {4}\n    </section><section data-group-conversation class="chat-conversation" hidden></section></div>\n  </article>',
    '<article class="card chat-panel">\n    <div class="chat-welcome">{5}<h2>聊聊吧？</h2><p>请从菜单中选择对话。</p></div>\n    <div class="chat-feedback"><p data-message-status role="status"></p><details class="chat-options"><summary>连接</summary><div class="chat-popover"><p data-message-live role="status"></p><button data-message-refresh type="button">{10}立即同步</button></div></details></div>\n    <div class="chat-layout"><section data-direct-conversation class="chat-conversation">\n      <header class="chat-header"><button data-chat-back class="chat-icon chat-mobile-back" type="button" aria-label="返回对话">{0}</button><button data-chat-avatar class="chat-peer-avatar" type="button" disabled aria-label="放大图片">#</button><div class="chat-peer"><h3 data-message-peer></h3><p data-peer-presence></p></div><button data-call-start class="chat-icon" type="button" aria-label="语音通话" title="语音通话">{1}</button><details class="chat-options"><summary class="chat-icon" aria-label="对话选项" title="对话选项">{2}</summary><div class="chat-popover"><button data-chat-edit-contact type="button">{7}编辑联系人</button><details><summary>{8}代表授权</summary><div data-representative-chat></div></details><a href="#settings">{9}个人资料与设置</a></div></details>{3}</header>\n      <div class="chat-thread">{6}<p data-message-gate class="chat-gate" role="status"></p><button data-message-older class="chat-older" type="button" hidden>更早的消息</button><div data-message-history class="chat-history" tabindex="0" aria-label="对话消息" hidden></div><ul data-message-pending class="chat-pending" aria-label="此设备上的待发送内容"></ul></div>\n      {4}\n    </section><section data-group-conversation class="chat-conversation" hidden></section></div>\n  </article>',
  ],
  ' Count unavailable.': [' Count unavailable.', ' 浏览数不可用。'],
  ' Count unavailable: {0}': [' Count unavailable: {0}', ' 浏览数不可用：{0}'],
  'html.73d7b945254a': [
    '<section class="chat-conversation"><header class="chat-header"><div class="chat-peer"><h3>Handle messages</h3><p>Conversations with public profiles</p></div>{0}</header><div class="chat-thread"><div data-dm-list class="dm-list"></div></div></section>',
    '<section class="chat-conversation"><header class="chat-header"><div class="chat-peer"><h3>用户名私信</h3><p>与公开个人资料的对话</p></div>{0}</header><div class="chat-thread"><div data-dm-list class="dm-list"></div></div></section>',
  ],
  'html.bac5e10aced2': [
    '<section class="chat-conversation">\n    <header class="chat-header"><a class="chat-icon chat-mobile-back" href="#communities?view=dms" aria-label="Back to handle messages">{0}</a><button data-dm-avatar class="chat-peer-avatar" type="button" aria-label="View profile photo" disabled>@</button><div class="chat-peer"><h3 data-dm-peer></h3><p data-dm-state></p></div><details class="chat-options"><summary class="chat-icon" aria-label="Conversation options" title="Conversation options">{1}</summary><div class="chat-popover" data-dm-options></div></details>{2}</header>\n    <div class="chat-thread"><p data-dm-gate class="chat-gate" role="status"></p><button data-dm-older class="chat-older" type="button" hidden>Earlier messages</button><div data-dm-history class="chat-history" tabindex="0" aria-label="Conversation messages"></div></div>\n    <div data-dm-request class="dm-request" hidden></div>\n    {3}\n  </section>',
    '<section class="chat-conversation">\n    <header class="chat-header"><a class="chat-icon chat-mobile-back" href="#communities?view=dms" aria-label="返回用户名私信">{0}</a><button data-dm-avatar class="chat-peer-avatar" type="button" aria-label="查看头像" disabled>@</button><div class="chat-peer"><h3 data-dm-peer></h3><p data-dm-state></p></div><details class="chat-options"><summary class="chat-icon" aria-label="对话选项" title="对话选项">{1}</summary><div class="chat-popover" data-dm-options></div></details>{2}</header>\n    <div class="chat-thread"><p data-dm-gate class="chat-gate" role="status"></p><button data-dm-older class="chat-older" type="button" hidden>更早的消息</button><div data-dm-history class="chat-history" tabindex="0" aria-label="对话消息"></div></div>\n    <div data-dm-request class="dm-request" hidden></div>\n    {3}\n  </section>',
  ],
  ' · Archived': [' · Archived', ' · 已归档'],
  ' · saved identity reference': [
    ' · saved identity reference',
    ' · 已保存身份参考',
  ],
  ' · removed from active contacts': [
    ' · removed from active contacts',
    ' · 已从当前联系人中移除',
  ],
  'html.77e1353773c1': [
    '<article class="card"><form data-contact-settings><div data-discovery-choices></div><p>Being discoverable allows conversation requests. You still need to accept.</p><p>These choices apply to private wallet chats. Your public @ profile and posts have separate visibility.</p><button type="submit" class="primary">Apply visibility</button></form><details class="settings-help"><summary>Who can see my data?</summary><p>There is no public wallet directory or name search. Your chosen name appears in requests; photo and presence are restricted to approved contacts.</p></details><p data-contact-status role="status"></p><button data-contact-action="refresh" type="button" hidden>Try again</button></article>',
    '<article class="card"><form data-contact-settings><div data-discovery-choices></div><p>允许被找到后，他人可以申请聊天。你仍需接受。</p><p>这些选项仅适用于基于钱包的私密聊天。你的公开 @ 资料和帖子有独立的可见性设置。</p><button type="submit" class="primary">应用可见性设置</button></form><details class="settings-help"><summary>谁能查看我的数据？</summary><p>没有公开钱包目录，也无法按姓名搜索。你设置的名称会显示在请求中；图片和在线状态仅已批准联系人可见。</p></details><p data-contact-status role="status"></p><button data-contact-action="refresh" type="button" hidden>重试</button></article>',
  ],
  'html.c6799e4dff82': [
    '<article class="card contacts-card">\n<header class="contacts-heading"><div><h1>Contacts</h1><p>Your contacts and conversation requests.</p></div><div class="contact-create-actions"><button data-private-group-action="create" type="button">Create group</button><button data-private-group-action="join" type="button">Join by link</button><button data-contact-add class="primary" type="button"><span aria-hidden="true">＋</span> Add contact</button></div></header>\n<div class="contacts-toolbar"><label class="contact-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg><input data-book-search type="search" maxlength="80" autocomplete="off" aria-label="Search this list" placeholder="Search this list…"></label><button data-contact-own-open class="contact-invite-link" type="button">My invitation ↗</button></div>\n<div class="contact-tabs" role="tablist" aria-label="Contact lists">\n<button data-contact-tab="main" data-tab="approved" role="tab" id="contacts-tab-approved" aria-controls="contacts-panel-approved" aria-selected="true" type="button">Contacts</button>\n<button data-contact-tab="main" data-tab="requests" role="tab" id="contacts-tab-requests" aria-controls="contacts-panel-requests" aria-selected="false" tabindex="-1" type="button">Requests <span data-contact-request-count class="contact-count" hidden></span></button>\n\n<button data-contact-tab="main" data-tab="blocked" role="tab" id="contacts-tab-blocked" aria-controls="contacts-panel-blocked" aria-selected="false" tabindex="-1" type="button">Blocked</button></div>\n<section data-contact-panel="main" data-tab="approved" id="contacts-panel-approved" role="tabpanel" aria-labelledby="contacts-tab-approved"><div class="contact-section-heading"><h2>Contacts</h2><span data-contact-page-state="approved"></span></div><ul data-contact-list="approved" class="contact-list"></ul><button data-contact-page="approved" class="contact-more" type="button" hidden>Next page</button><button data-contact-page="outgoing" class="contact-more" type="button" hidden>More pending contacts</button><button data-contact-action="book-more" class="contact-more" type="button" hidden>More saved contacts</button></section>\n<section data-contact-panel="main" data-tab="requests" id="contacts-panel-requests" role="tabpanel" aria-labelledby="contacts-tab-requests" hidden><div class="contact-subtabs" role="tablist" aria-label="Requests"><button data-contact-tab="requests" data-tab="incoming" role="tab" id="contacts-tab-incoming" aria-controls="contacts-panel-incoming" aria-selected="true" type="button">Received</button><button data-contact-tab="requests" data-tab="outgoing" role="tab" id="contacts-tab-outgoing" aria-controls="contacts-panel-outgoing" aria-selected="false" tabindex="-1" type="button">Sent</button><button data-contact-tab="requests" data-tab="rejected" role="tab" id="contacts-tab-rejected" aria-controls="contacts-panel-rejected" aria-selected="false" tabindex="-1" type="button">Declined</button></div>\n<section data-contact-panel="requests" data-tab="incoming" id="contacts-panel-incoming" role="tabpanel" aria-labelledby="contacts-tab-incoming"><p class="contact-hint">You decide who can chat with you.</p><ul data-contact-list="incoming" class="contact-list"></ul><button data-contact-page="incoming" class="contact-more" type="button" hidden>Next page</button></section>\n<section data-contact-panel="requests" data-tab="outgoing" id="contacts-panel-outgoing" role="tabpanel" aria-labelledby="contacts-tab-outgoing" hidden><p class="contact-hint">Waiting for the recipient to accept.</p><ul data-contact-list="outgoing" class="contact-list"></ul><button data-contact-page="outgoing" class="contact-more" type="button" hidden>Next page</button></section>\n<section data-contact-panel="requests" data-tab="rejected" id="contacts-panel-rejected" role="tabpanel" aria-labelledby="contacts-tab-rejected" hidden><ul data-contact-list="rejected" class="contact-list"></ul><button data-contact-page="rejected" class="contact-more" type="button" hidden>Next page</button></section></section>\n\n<section data-contact-panel="main" data-tab="blocked" id="contacts-panel-blocked" role="tabpanel" aria-labelledby="contacts-tab-blocked" hidden><div class="contact-section-heading"><h2>Blocks</h2></div><p class="contact-hint">Unblocking requires a new acceptance before chatting. The block applies to this identity.</p><ul data-contact-list="blocked" class="contact-list"></ul><button data-contact-page="blocked" class="contact-more" type="button" hidden>Next page</button></section>\n<div class="contact-feedback"><p data-contact-status role="status"></p><button data-contact-action="refresh" type="button" hidden>Try again</button></div><p class="contact-test-note">Search in items loaded on this device.</p>{0}</article>',
    '<article class="card contacts-card">\n<header class="contacts-heading"><div><h1>联系人</h1><p>你的联系人与聊天请求。</p></div><div class="contact-create-actions"><button data-private-group-action="create" type="button">创建群组</button><button data-private-group-action="join" type="button">通过链接加入</button><button data-contact-add class="primary" type="button"><span aria-hidden="true">＋</span> 添加联系人</button></div></header>\n<div class="contacts-toolbar"><label class="contact-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg><input data-book-search type="search" maxlength="80" autocomplete="off" aria-label="搜索此列表" placeholder="搜索此列表…"></label><button data-contact-own-open class="contact-invite-link" type="button">我的邀请 ↗</button></div>\n<div class="contact-tabs" role="tablist" aria-label="联系人列表">\n<button data-contact-tab="main" data-tab="approved" role="tab" id="contacts-tab-approved" aria-controls="contacts-panel-approved" aria-selected="true" type="button">联系人</button>\n<button data-contact-tab="main" data-tab="requests" role="tab" id="contacts-tab-requests" aria-controls="contacts-panel-requests" aria-selected="false" tabindex="-1" type="button">请求 <span data-contact-request-count class="contact-count" hidden></span></button>\n\n<button data-contact-tab="main" data-tab="blocked" role="tab" id="contacts-tab-blocked" aria-controls="contacts-panel-blocked" aria-selected="false" tabindex="-1" type="button">已屏蔽</button></div>\n<section data-contact-panel="main" data-tab="approved" id="contacts-panel-approved" role="tabpanel" aria-labelledby="contacts-tab-approved"><div class="contact-section-heading"><h2>联系人</h2><span data-contact-page-state="approved"></span></div><ul data-contact-list="approved" class="contact-list"></ul><button data-contact-page="approved" class="contact-more" type="button" hidden>下一页</button><button data-contact-page="outgoing" class="contact-more" type="button" hidden>更多待接受的联系人</button><button data-contact-action="book-more" class="contact-more" type="button" hidden>更多已保存的联系人</button></section>\n<section data-contact-panel="main" data-tab="requests" id="contacts-panel-requests" role="tabpanel" aria-labelledby="contacts-tab-requests" hidden><div class="contact-subtabs" role="tablist" aria-label="请求"><button data-contact-tab="requests" data-tab="incoming" role="tab" id="contacts-tab-incoming" aria-controls="contacts-panel-incoming" aria-selected="true" type="button">已收到</button><button data-contact-tab="requests" data-tab="outgoing" role="tab" id="contacts-tab-outgoing" aria-controls="contacts-panel-outgoing" aria-selected="false" tabindex="-1" type="button">已发送</button><button data-contact-tab="requests" data-tab="rejected" role="tab" id="contacts-tab-rejected" aria-controls="contacts-panel-rejected" aria-selected="false" tabindex="-1" type="button">已拒绝</button></div>\n<section data-contact-panel="requests" data-tab="incoming" id="contacts-panel-incoming" role="tabpanel" aria-labelledby="contacts-tab-incoming"><p class="contact-hint">由你决定谁可以与你聊天。</p><ul data-contact-list="incoming" class="contact-list"></ul><button data-contact-page="incoming" class="contact-more" type="button" hidden>下一页</button></section>\n<section data-contact-panel="requests" data-tab="outgoing" id="contacts-panel-outgoing" role="tabpanel" aria-labelledby="contacts-tab-outgoing" hidden><p class="contact-hint">等待接收者接受。</p><ul data-contact-list="outgoing" class="contact-list"></ul><button data-contact-page="outgoing" class="contact-more" type="button" hidden>下一页</button></section>\n<section data-contact-panel="requests" data-tab="rejected" id="contacts-panel-rejected" role="tabpanel" aria-labelledby="contacts-tab-rejected" hidden><ul data-contact-list="rejected" class="contact-list"></ul><button data-contact-page="rejected" class="contact-more" type="button" hidden>下一页</button></section></section>\n\n<section data-contact-panel="main" data-tab="blocked" id="contacts-panel-blocked" role="tabpanel" aria-labelledby="contacts-tab-blocked" hidden><div class="contact-section-heading"><h2>屏蔽列表</h2></div><p class="contact-hint">解除屏蔽后，需要重新接受才能聊天。屏蔽针对该身份。</p><ul data-contact-list="blocked" class="contact-list"></ul><button data-contact-page="blocked" class="contact-more" type="button" hidden>下一页</button></section>\n<div class="contact-feedback"><p data-contact-status role="status"></p><button data-contact-action="refresh" type="button" hidden>重试</button></div><p class="contact-test-note">搜索此设备上已加载的项目。</p>{0}</article>',
  ],
  'html.628f1388b464': [
    '<dialog data-contact-editor class="contact-dialog" aria-labelledby="contact-editor-title"><header><div><span class="contact-eyebrow">YOUR CONTACTS</span><h2 id="contact-editor-title" data-book-title>Add contact</h2></div><button data-contact-editor-close class="contact-close" type="button" aria-label="Close form">{0}</button></header>\n<div class="contact-subtabs" role="tablist" aria-label="How to add a contact"><button data-contact-tab="editor" data-tab="wallet" role="tab" id="contact-tab-wallet" aria-controls="contact-panel-wallet" aria-selected="true" type="button">By wallet</button><button data-contact-tab="editor" data-tab="invite" role="tab" id="contact-tab-invite" aria-controls="contact-panel-invite" aria-selected="false" tabindex="-1" type="button">By invitation</button></div>\n<section data-contact-panel="editor" data-tab="wallet" id="contact-panel-wallet" role="tabpanel" aria-labelledby="contact-tab-wallet"><form data-book-form><label>Full wallet address<input data-book-address required maxlength="128" autocomplete="off" spellcheck="false" placeholder="0x… or a Solana address"></label><label><span>Private nickname <small class="contact-optional">opcional</small></span><input data-book-alias maxlength="80" autocomplete="off" placeholder="How you want to save this contact"></label><p class="contact-hint">Saving to contacts does not send a request.</p><div class="contact-form-actions"><button type="submit" class="primary">Save contact</button><button data-contact-action="discover" type="button">Request conversation</button></div></form><p data-contact-discovery class="contact-hint"></p><div data-contact-discovery-actions></div></section>\n<section data-contact-panel="editor" data-tab="invite" id="contact-panel-invite" role="tabpanel" aria-labelledby="contact-tab-invite" hidden>{1}<div data-contact-invite-peer></div></section>\n<div class="contact-feedback"><p data-contact-editor-status role="status"></p></div></dialog>',
    '<dialog data-contact-editor class="contact-dialog" aria-labelledby="contact-editor-title"><header><div><span class="contact-eyebrow">你的联系人</span><h2 id="contact-editor-title" data-book-title>添加联系人</h2></div><button data-contact-editor-close class="contact-close" type="button" aria-label="关闭表单">{0}</button></header>\n<div class="contact-subtabs" role="tablist" aria-label="如何添加联系人"><button data-contact-tab="editor" data-tab="wallet" role="tab" id="contact-tab-wallet" aria-controls="contact-panel-wallet" aria-selected="true" type="button">通过钱包</button><button data-contact-tab="editor" data-tab="invite" role="tab" id="contact-tab-invite" aria-controls="contact-panel-invite" aria-selected="false" tabindex="-1" type="button">通过邀请</button></div>\n<section data-contact-panel="editor" data-tab="wallet" id="contact-panel-wallet" role="tabpanel" aria-labelledby="contact-tab-wallet"><form data-book-form><label>完整钱包地址<input data-book-address required maxlength="128" autocomplete="off" spellcheck="false" placeholder="0x… 或 Solana 地址"></label><label><span>私密备注名 <small class="contact-optional">opcional</small></span><input data-book-alias maxlength="80" autocomplete="off" placeholder="此联系人的保存名称"></label><p class="contact-hint">保存到联系人不会发送请求。</p><div class="contact-form-actions"><button type="submit" class="primary">保存联系人</button><button data-contact-action="discover" type="button">申请聊天</button></div></form><p data-contact-discovery class="contact-hint"></p><div data-contact-discovery-actions></div></section>\n<section data-contact-panel="editor" data-tab="invite" id="contact-panel-invite" role="tabpanel" aria-labelledby="contact-tab-invite" hidden>{1}<div data-contact-invite-peer></div></section>\n<div class="contact-feedback"><p data-contact-editor-status role="status"></p></div></dialog>',
  ],
  'html.597746d2b14a': [
    '<dialog data-contact-invites class="contact-dialog" aria-labelledby="contact-invites-title"><header><div><span class="contact-eyebrow">SHARE CONTACT</span><h2 id="contact-invites-title">My invitation</h2></div><button data-contact-invites-close class="contact-close" type="button" aria-label="Close my invitation">{0}</button></header><p class="contact-hint">Create a fresh invitation before sharing its link or QR. You still choose whether to accept the request.</p><div data-contact-own-invite hidden><label>My invitation link<input data-contact-invite readonly spellcheck="false"></label><div data-contact-invite-qr class="device-qr"></div><div class="contact-form-actions"><button data-contact-action="copy" type="button" class="primary">Copy link</button><button data-contact-action="revoke" type="button">Revoke invitation</button></div></div><button data-contact-action="rotate" type="button">Create new invitation</button><p class="contact-hint">Each invitation expires after 24 hours and allows one request. Creating another does not cancel previous invitations.</p><div class="contact-feedback"><p data-contact-invite-status role="status"></p></div></dialog>',
    '<dialog data-contact-invites class="contact-dialog" aria-labelledby="contact-invites-title"><header><div><span class="contact-eyebrow">分享联系人</span><h2 id="contact-invites-title">我的邀请</h2></div><button data-contact-invites-close class="contact-close" type="button" aria-label="关闭我的邀请">{0}</button></header><p class="contact-hint">分享链接或二维码前，请先创建新邀请。你仍可选择是否接受申请。</p><div data-contact-own-invite hidden><label>我的邀请链接<input data-contact-invite readonly spellcheck="false"></label><div data-contact-invite-qr class="device-qr"></div><div class="contact-form-actions"><button data-contact-action="copy" type="button" class="primary">复制链接</button><button data-contact-action="revoke" type="button">撤销邀请</button></div></div><button data-contact-action="rotate" type="button">创建新邀请</button><p class="contact-hint">每个邀请在24小时后到期，仅可申请一次。创建新邀请不会撤销已有邀请。</p><div class="contact-feedback"><p data-contact-invite-status role="status"></p></div></dialog>',
  ],
  'html.801287f32cb5': [
    '<form data-contact-invite-form><label>Invitation link<input data-contact-received type="url" maxlength="512" required autocomplete="off" spellcheck="false" placeholder="Paste a 0xDMme link"></label><p class="contact-hint">The invitation allows a conversation request. The recipient must accept.</p><div class="contact-form-actions"><button type="submit" class="primary">Request conversation</button><button data-contact-action="scan" type="button">Scan QR</button><button data-contact-action="stop-camera" type="button" hidden>Stop camera</button></div><video data-contact-camera hidden muted playsinline></video></form>',
    '<form data-contact-invite-form><label>邀请链接<input data-contact-received type="url" maxlength="512" required autocomplete="off" spellcheck="false" placeholder="粘贴 0xDMme 链接"></label><p class="contact-hint">邀请允许发起聊天请求。接收者仍需接受。</p><div class="contact-form-actions"><button type="submit" class="primary">申请聊天</button><button data-contact-action="scan" type="button">扫描二维码</button><button data-contact-action="stop-camera" type="button" hidden>关闭摄像头</button></div><video data-contact-camera hidden muted playsinline></video></form>',
  ],
  'html.5acc35953618': [
    '<summary>Sign in from another device</summary><p>On a connected device, open Profile → Connected devices and generate a code.</p><label>Linking code or link<textarea data-enrollment-code spellcheck="false" autocomplete="off" autocapitalize="none" placeholder="Paste code or link"></textarea></label><button type="button">Continue</button><p role="status"></p>',
    '<summary>从另一台设备登录</summary><p>在已连接设备上，打开“个人资料 → 已连接设备”并生成代码。</p><label>关联码或链接<textarea data-enrollment-code spellcheck="false" autocomplete="off" autocapitalize="none" placeholder="粘贴代码或链接"></textarea></label><button type="button">继续</button><p role="status"></p>',
  ],
  'html.73a1fbbc7e77': [
    '<h2>Sign in on this device?</h2><p>Connect this browser to the account on the device that generated the QR code.</p><p data-enrollment-status role="status">Keep the source device open until the connection finishes.</p><button type="button" data-enrollment-confirm class="primary">Confirm sign-in</button><button type="button" data-enrollment-close>Cancel</button>',
    '<h2>在此设备上登录？</h2><p>将此浏览器连接到生成二维码的设备所使用的账户。</p><p data-enrollment-status role="status">连接完成前，请保持源设备打开。</p><button type="button" data-enrollment-confirm class="primary">确认登录</button><button type="button" data-enrollment-close>取消</button>',
  ],
  'html.63049f816b60': [
    '<article class="card"><h2>Devices</h2><p data-device-status role="status"></p><button data-device-wallet type="button" hidden>Confirm wallet for sensitive actions</button><button data-device-retry type="button" hidden>Try again</button><div data-wallet-pending hidden><button data-wallet-open type="button">Open wallet</button><button data-wallet-cancel type="button">Cancel</button></div><div data-devices-connected hidden><ul data-device-list></ul><button data-device-create type="button">Link another device</button><div data-enrollment-code hidden><div data-link-qr class="device-qr"></div><textarea data-device-code readonly aria-label="Device linking code"></textarea><button data-device-copy type="button">Copy code</button><p>Keep this app open while linking. The code is valid for five minutes.</p></div></div><form data-device-join><label>Device linking code<textarea data-device-received required spellcheck="false"></textarea></label><button type="submit">Link this device</button><button data-device-scan type="button">Scan QR code</button></form><div data-camera hidden><video muted playsinline aria-label="Scan linking code"></video><button data-stop-camera type="button">Close camera</button></div></article>',
    '<article class="card"><h2>设备</h2><p data-device-status role="status"></p><button data-device-wallet type="button" hidden>确认钱包以执行敏感操作</button><button data-device-retry type="button" hidden>重试</button><div data-wallet-pending hidden><button data-wallet-open type="button">打开钱包</button><button data-wallet-cancel type="button">取消</button></div><div data-devices-connected hidden><ul data-device-list></ul><button data-device-create type="button">关联另一台设备</button><div data-enrollment-code hidden><div data-link-qr class="device-qr"></div><textarea data-device-code readonly aria-label="设备关联码"></textarea><button data-device-copy type="button">复制代码</button><p>关联期间请保持应用打开。代码五分钟内有效。</p></div></div><form data-device-join><label>设备关联码<textarea data-device-received required spellcheck="false"></textarea></label><button type="submit">关联此设备</button><button data-device-scan type="button">扫描二维码</button></form><div data-camera hidden><video muted playsinline aria-label="扫描关联码"></video><button data-stop-camera type="button">关闭摄像头</button></div></article>',
  ],
  ' · this device': [' · this device', ' · 此设备'],
  'html.81724dfa0bc5': [
    '<nav class="picker-modes" data-modes hidden aria-label="Emoji or GIF"><button type="button" data-mode="emoji" aria-pressed="true">Emoji</button><button type="button" data-mode="gif" aria-pressed="false">GIF</button></nav><div class="gif-pane" data-gif-pane hidden></div><div class="emoji-top"><label class="emoji-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span class="visually-hidden">Search emoji</span><input type="search" maxlength="128" autocomplete="off" data-query placeholder="Search emoji"></label><label class="emoji-tone"><span class="visually-hidden">Skin tone</span><select data-tone></select></label><button type="button" class="emoji-close" data-close aria-label="Close emoji panel">×</button></div><section class="emoji-recent" data-recent-section hidden><h3>Recent</h3><div class="emoji-recent-row" data-recent></div></section><h3 class="emoji-section-title" data-section-title></h3><div data-grid class="emoji-grid" role="listbox" aria-label="Emoji"></div><p data-result class="emoji-empty" role="status"></p><button type="button" class="emoji-custom" data-custom hidden>Use typed emoji</button><nav class="emoji-dock" data-dock aria-label="Emoji categories"></nav><small class="emoji-credit" data-art role="status">Loading artwork…</small>',
    '<nav class="picker-modes" data-modes hidden aria-label="表情或 GIF"><button type="button" data-mode="emoji" aria-pressed="true">表情</button><button type="button" data-mode="gif" aria-pressed="false">GIF</button></nav><div class="gif-pane" data-gif-pane hidden></div><div class="emoji-top"><label class="emoji-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span class="visually-hidden">搜索表情</span><input type="search" maxlength="128" autocomplete="off" data-query placeholder="搜索表情"></label><label class="emoji-tone"><span class="visually-hidden">肤色</span><select data-tone></select></label><button type="button" class="emoji-close" data-close aria-label="关闭表情面板">×</button></div><section class="emoji-recent" data-recent-section hidden><h3>最近</h3><div class="emoji-recent-row" data-recent></div></section><h3 class="emoji-section-title" data-section-title></h3><div data-grid class="emoji-grid" role="listbox" aria-label="表情"></div><p data-result class="emoji-empty" role="status"></p><button type="button" class="emoji-custom" data-custom hidden>使用输入的表情</button><nav class="emoji-dock" data-dock aria-label="表情类别"></nav><small class="emoji-credit" data-art role="status">正在加载表情图案…</small>',
  ],
  'html.201618052901': [
    '<label class="emoji-search gif-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span class="visually-hidden">Search GIF</span><input type="search" maxlength="100" autocomplete="off" data-gif-query placeholder="Search KLIPY"></label><div class="gif-grid" data-gif-grid></div><p class="emoji-empty" data-gif-status role="status"></p><small class="emoji-credit">Powered by KLIPY · searches and GIFs go through KLIPY</small>',
    '<label class="emoji-search gif-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span class="visually-hidden">搜索 GIF</span><input type="search" maxlength="100" autocomplete="off" data-gif-query placeholder="搜索 KLIPY"></label><div class="gif-grid" data-gif-grid></div><p class="emoji-empty" data-gif-status role="status"></p><small class="emoji-credit">由 KLIPY 提供 · 搜索和 GIF 通过 KLIPY</small>',
  ],
  'html.ea146116f72c': [
    '<p class="group-hint">Add your contacts to the group. They can leave at any time.</p><label class="group-search">Search this list<input data-contact-search type="search" placeholder="Name or wallet" autocomplete="off"></label><ul data-contacts class="group-people-list"></ul><button data-more-contacts type="button" hidden>More contacts</button><section class="group-invitation-section"><h3>Invite by link</h3><p class="group-hint">Anyone with the link can join. Generating one on another device may replace the current invitation.</p><div class="group-button-row"><button data-link class="group-primary" type="button">Generate / copy link</button><button data-revoke class="group-secondary" type="button">Revoke link</button></div><label data-invitation-label hidden>Shareable invitation<input data-invitation readonly></label></section>',
    '<p class="group-hint">将联系人添加到群组。他们可以随时退出。</p><label class="group-search">搜索此列表<input data-contact-search type="search" placeholder="名称或钱包地址" autocomplete="off"></label><ul data-contacts class="group-people-list"></ul><button data-more-contacts type="button" hidden>更多联系人</button><section class="group-invitation-section"><h3>通过链接邀请</h3><p class="group-hint">任何持有链接的人都可以加入。在其他设备上生成链接可能替换当前邀请。</p><div class="group-button-row"><button data-link class="group-primary" type="button">生成/复制链接</button><button data-revoke class="group-secondary" type="button">撤销链接</button></div><label data-invitation-label hidden>可分享邀请<input data-invitation readonly></label></section>',
  ],
  'html.9012ccf1c0d4': [
    '<form><label>Invitation link<input name="invitation" type="url" required autocomplete="off" spellcheck="false"></label><p>When you join, participants will see your private profile. You will receive messages from the time you join.</p><div class="group-form-footer"><button class="group-primary" type="submit">Join group</button></div></form>',
    '<form><label>邀请链接<input name="invitation" type="url" required autocomplete="off" spellcheck="false"></label><p>加入后，成员将看到你的私密个人资料。你只能接收加入后的消息。</p><div class="group-form-footer"><button class="group-primary" type="submit">加入群组</button></div></form>',
  ],
  'html.c392c59440f2': [
    '<div class="group-create-preview"><span data-create-avatar class="group-create-avatar" aria-hidden="true">#</span><p>A place to talk<br>with your people.</p></div><input data-create-photo-file type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="group-button-row group-create-photo-actions"><button data-create-photo-pick type="button">Choose photo</button><button data-create-photo-remove type="button" hidden>Remove photo</button></div><form><label>Group name<input name="title" maxlength="160" required autocomplete="off" placeholder="What will the group be called?"></label><label>Description (optional)<textarea name="description" maxlength="1000" rows="3" placeholder="What is this group about?"></textarea></label><p class="group-hint">After creating, add contacts or share an invitation.</p><div class="group-form-footer"><button class="group-primary" type="submit">Create group</button></div></form>',
    '<div class="group-create-preview"><span data-create-avatar class="group-create-avatar" aria-hidden="true">#</span><p>一个聊天的空间<br>与你关心的人。</p></div><input data-create-photo-file type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="group-button-row group-create-photo-actions"><button data-create-photo-pick type="button">选择图片</button><button data-create-photo-remove type="button" hidden>移除图片</button></div><form><label>群组名称<input name="title" maxlength="160" required autocomplete="off" placeholder="群组叫什么名字？"></label><label>简介（可选）<textarea name="description" maxlength="1000" rows="3" placeholder="介绍一下这个群组"></textarea></label><p class="group-hint">创建后，添加联系人或分享邀请。</p><div class="group-form-footer"><button class="group-primary" type="submit">创建群组</button></div></form>',
  ],
  'html.8f97d3de1ea5': [
    '<header><div><span class="group-eyebrow">PRIVATE GROUP</span><h2 id="group-dialog-title"></h2></div><button data-close class="group-close" type="button" aria-label="Close">{0}</button></header>{1}<p data-feedback class="group-feedback" role="status"></p>',
    '<header><div><span class="group-eyebrow">私密群组</span><h2 id="group-dialog-title"></h2></div><button data-close class="group-close" type="button" aria-label="关闭">{0}</button></header>{1}<p data-feedback class="group-feedback" role="status"></p>',
  ],
  'html.e652af8025ee': [
    '<header class="chat-header"><button data-chat-back class="chat-icon chat-mobile-back" type="button" aria-label="Back to conversations">{0}</button><button data-group-avatar data-group-photo class="chat-peer-avatar group-photo-trigger" type="button" aria-label="Change group photo">#</button><div class="chat-peer"><h3 data-group-title></h3><p data-group-count></p></div><button data-group-settings-open class="chat-icon" type="button" aria-label="Group settings" title="Group settings">{1}</button>{2}</header><p data-group-notice class="compose-notice" role="status"></p><div class="chat-thread"><button data-group-older class="chat-older" type="button" hidden>Earlier messages</button><div data-group-history class="chat-history" tabindex="0" aria-label="Group messages"></div></div>{3}',
    '<header class="chat-header"><button data-chat-back class="chat-icon chat-mobile-back" type="button" aria-label="返回对话">{0}</button><button data-group-avatar data-group-photo class="chat-peer-avatar group-photo-trigger" type="button" aria-label="更换群组图片">#</button><div class="chat-peer"><h3 data-group-title></h3><p data-group-count></p></div><button data-group-settings-open class="chat-icon" type="button" aria-label="群组设置" title="群组设置">{1}</button>{2}</header><p data-group-notice class="compose-notice" role="status"></p><div class="chat-thread"><button data-group-older class="chat-older" type="button" hidden>更早的消息</button><div data-group-history class="chat-history" tabindex="0" aria-label="群组消息"></div></div>{3}',
  ],
  'html.8694eeb2078e': [
    '<button data-group-new type="button">New group</button><p data-group-mode></p><button data-group-cancel-create type="button" hidden>Discard local creation request</button><details><summary>Group invitations and transfers</summary><div data-group-incoming></div><button data-group-more-incoming type="button" hidden>More invitations</button></details>',
    '<button data-group-new type="button">新群组</button><p data-group-mode></p><button data-group-cancel-create type="button" hidden>丢弃本地创建请求</button><details><summary>群组邀请与转让</summary><div data-group-incoming></div><button data-group-more-incoming type="button" hidden>更多邀请</button></details>',
  ],
  ' · ⚠ media cleanup in {0}': [
    ' · ⚠ media cleanup in {0}',
    ' · ⚠ 媒体将在 {0} 后清理',
  ],
  ' · {0} unread': [' · {0} unread', ' · {0} 条未读'],
  ' · muted': [' · muted', ' · 已静音'],
  'html.b63f4d3d54aa': [
    '<header><div><span class="group-eyebrow">PRIVATE GROUP</span><h2>Group photo</h2></div><button data-close class="group-close" type="button" aria-label="Close group photo">{0}</button></header><div data-preview class="group-photo-preview" aria-hidden="true"></div><p class="group-hint">Choose a group photo. It will be cropped to a square.</p><input data-file type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="group-button-row"><button data-pick type="button">Choose photo</button><button data-remove class="group-danger" type="button">Remove photo</button></div><div class="group-form-footer"><button data-save class="group-primary" type="button" disabled>Save photo</button></div><p data-feedback class="group-feedback" role="status"></p>',
    '<header><div><span class="group-eyebrow">私密群组</span><h2>群组图片</h2></div><button data-close class="group-close" type="button" aria-label="关闭群组图片">{0}</button></header><div data-preview class="group-photo-preview" aria-hidden="true"></div><p class="group-hint">请选择群组图片。图片将裁剪为正方形。</p><input data-file type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="group-button-row"><button data-pick type="button">选择图片</button><button data-remove class="group-danger" type="button">移除图片</button></div><div class="group-form-footer"><button data-save class="group-primary" type="button" disabled>保存图片</button></div><p data-feedback class="group-feedback" role="status"></p>',
  ],
  'html.6f2aac1c9ed0': [
    '<dialog data-group-settings class="group-dialog group-settings" aria-label="Group settings"><header><div><span class="group-eyebrow">PRIVATE GROUP</span><h2>Group settings</h2></div><button data-group-settings-close class="group-close" type="button" aria-label="Close settings">{0}</button></header><div class="group-settings-identity"><button data-group-settings-avatar data-group-photo class="group-person-avatar group-photo-trigger" type="button" aria-label="Change group photo" title="Change group photo"></button><div><strong data-group-settings-title></strong><p data-group-settings-count></p></div></div><section class="group-description-section"><h3>Description</h3><p data-group-description></p><form data-group-description-form hidden><label>Edit description<textarea data-group-description-input maxlength="1000" rows="3"></textarea></label><button data-group-description-save class="group-primary" type="submit">Save description</button><button data-group-description-reload type="button">Reload description</button></form><p data-group-description-feedback class="group-feedback" role="status"></p></section><section class="group-members-section"><div class="group-section-heading"><h3>Participants</h3><button data-group-manage class="group-primary" type="button">Add</button></div><ul data-group-members class="group-people-list"></ul></section><details data-group-vault class="group-vault"><summary>Group vault<span aria-hidden="true">⌄</span></summary><div class="group-vault-body"><p data-group-usage></p><p data-group-cleanup-warning role="status"></p><ul data-group-cleanup-items></ul><button data-group-cleanup-more type="button" hidden>Next selected media</button><p><a href="#vault">Save an encrypted backup</a> to keep a copy of media before cleanup. Statuses are not included in the backup.</p><button data-group-clear class="group-danger" type="button">Clear remote vault</button></div></details><footer class="group-settings-footer"><p data-group-owner-note class="group-hint">When you leave, you choose who becomes the owner. They do not need to accept.</p><div class="group-button-row"><button data-group-leave class="group-danger" type="button">Leave group</button><button data-group-delete class="group-danger" type="button">Delete group</button></div></footer><p data-group-settings-notice role="status" class="group-feedback"></p></dialog>',
    '<dialog data-group-settings class="group-dialog group-settings" aria-label="群组设置"><header><div><span class="group-eyebrow">私密群组</span><h2>群组设置</h2></div><button data-group-settings-close class="group-close" type="button" aria-label="关闭设置">{0}</button></header><div class="group-settings-identity"><button data-group-settings-avatar data-group-photo class="group-person-avatar group-photo-trigger" type="button" aria-label="更换群组图片" title="更换群组图片"></button><div><strong data-group-settings-title></strong><p data-group-settings-count></p></div></div><section class="group-description-section"><h3>简介</h3><p data-group-description></p><form data-group-description-form hidden><label>编辑简介<textarea data-group-description-input maxlength="1000" rows="3"></textarea></label><button data-group-description-save class="group-primary" type="submit">保存简介</button><button data-group-description-reload type="button">重新加载简介</button></form><p data-group-description-feedback class="group-feedback" role="status"></p></section><section class="group-members-section"><div class="group-section-heading"><h3>成员</h3><button data-group-manage class="group-primary" type="button">添加</button></div><ul data-group-members class="group-people-list"></ul></section><details data-group-vault class="group-vault"><summary>群组保险库<span aria-hidden="true">⌄</span></summary><div class="group-vault-body"><p data-group-usage></p><p data-group-cleanup-warning role="status"></p><ul data-group-cleanup-items></ul><button data-group-cleanup-more type="button" hidden>下一批已选媒体</button><p><a href="#vault">保存加密备份</a> 以在清理前保留媒体副本。状态不包含在备份中。</p><button data-group-clear class="group-danger" type="button">清理远程保险库</button></div></details><footer class="group-settings-footer"><p data-group-owner-note class="group-hint">退出时，由你选择新的所有者，对方无需接受。</p><div class="group-button-row"><button data-group-leave class="group-danger" type="button">退出群组</button><button data-group-delete class="group-danger" type="button">删除群组</button></div></footer><p data-group-settings-notice role="status" class="group-feedback"></p></dialog>',
  ],
  ' · conflicting organization': [
    ' · conflicting organization',
    ' · 组织存在冲突',
  ],
  'Edited · ': ['Edited · ', '已编辑 · '],
  'html.bc850aca5a52': [
    '<div class="search-heading"><h2 id="conversation-search-title">Search</h2><button type="button" data-search-close aria-label="Close search">×</button></div><form><label for="conversation-query">Chats, contacts or words in messages</label><div class="search-input-row"><input id="conversation-query" type="search" maxlength="128" autocomplete="off" spellcheck="false"><button type="submit">Search messages</button></div></form><p class="search-scope">Local search in loaded chats and messages synced or imported on this device.</p><h3>Chats and contacts</h3><div data-search-chats class="chat-contacts"></div><h3>Messages</h3><p data-search-notice role="status">Type to find a conversation or search for words in messages.</p><ul data-search-messages></ul><button type="button" data-search-next hidden>Continue search</button>',
    '<div class="search-heading"><h2 id="conversation-search-title">搜索</h2><button type="button" data-search-close aria-label="关闭搜索">×</button></div><form><label for="conversation-query">聊天、联系人或消息中的文字</label><div class="search-input-row"><input id="conversation-query" type="search" maxlength="128" autocomplete="off" spellcheck="false"><button type="submit">搜索消息</button></div></form><p class="search-scope">在此设备已加载的聊天以及已同步或导入的消息中进行本地搜索。</p><h3>聊天与联系人</h3><div data-search-chats class="chat-contacts"></div><h3>消息</h3><p data-search-notice role="status">输入以查找对话，或搜索消息中的文字。</p><ul data-search-messages></ul><button type="button" data-search-next hidden>继续搜索</button>',
  ],
  'html.71689221bc60': [
    '<article class="card notifications-card"><h2>Push on this device</h2><p>The provider receives subscription details and timing, without text, wallet or contact name.</p><div class="settings-actions"><button data-push-enable type="button">Enable push on this device</button><button data-push-disable type="button">Disable push on this device</button></div><p class="settings-hint">iPhone/iPad: open from the home screen icon before enabling. Your browser will ask for permission.</p><div data-push-settings></div>\n<section class="settings-block"><h3>Sounds</h3><div class="settings-actions"><button data-sound-toggle type="button" aria-pressed="true">Disable sounds</button><p data-sound-status role="status"></p></div></section>\n<details class="settings-help"><summary>How do alerts and sounds work?</summary><p>Notifications can show names, photos and message previews on the lock screen. Public posts and replies show public details; handle DMs do not send push notifications. Calls may show “Incoming voice call”, depending on the preference above. Push permission and lock screen display are controlled by the browser and system.</p><p>Sounds are on initially and the choice stays in this browser, including when switching accounts. The browser may require a tap to allow audio. Push volume and sound follow your system. Muted or archived conversations do not alert; offline or without a valid session, no new remote alert is shown.</p></details><p data-daily-status role="status"></p></article>',
    '<article class="card notifications-card"><h2>此设备的推送</h2><p>服务商会接收订阅信息和时间，不会接收文字、钱包信息或联系人姓名。</p><div class="settings-actions"><button data-push-enable type="button">在此设备上启用推送</button><button data-push-disable type="button">关闭此设备的推送</button></div><p class="settings-hint">iPhone/iPad：请先通过主屏幕图标打开，再启用。浏览器会请求权限。</p><div data-push-settings></div>\n<section class="settings-block"><h3>声音</h3><div class="settings-actions"><button data-sound-toggle type="button" aria-pressed="true">关闭声音</button><p data-sound-status role="status"></p></div></section>\n<details class="settings-help"><summary>通知和声音如何运作？</summary><p>通知可能会在锁屏上显示姓名、照片和消息预览。公开帖子和回复显示公开详情；用户名私信不会发送推送通知。根据上方设置，通话可能显示“收到语音来电”。推送权限和锁屏显示由浏览器及系统控制。</p><p>声音默认开启，选项保留在此浏览器中，包括切换账户后。浏览器可能需要点击才能播放音频。推送音量和声音由系统控制。静音或归档对话不会通知；离线或没有有效会话时，不会出现新的远程通知。</p></details><p data-daily-status role="status"></p></article>',
  ],
  'html.d3072845e018': [
    '<article class="card public-profile-card"><h2>Public profile</h2>\n<div data-public-create><p>Your handle, public activity and all followed communities are visible on the web. Your private wallet, name and photo are not included in this profile.</p><label>Public handle<input data-public-input type="text" minlength="3" maxlength="31" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="seu_nome"></label>\n<p>3–30 unaccented letters, numbers or _. Your handle is unique and fixed for the lifetime of your account.</p>\n<button type="button" class="primary" data-public-action="create">Create public profile</button></div>\n<div data-public-owned hidden></div>\n<section data-public-moderation aria-label="Rejected public files"></section>\n<div><button type="button" data-public-action="moderation-latest" hidden>Latest notices</button><button type="button" data-public-action="moderation-older" hidden>Previous notices</button></div>\n<p data-external-media-status role="status"></p><button type="button" data-public-action="external-media">External media</button>\n<p data-public-status role="status"></p><button type="button" data-public-action="reload" hidden>Try again</button></article>',
    '<article class="card public-profile-card"><h2>公开个人资料</h2>\n<div data-public-create><p>你的用户名、公开动态以及所有已关注社区在网页上可见。此个人资料不包含私密钱包信息、姓名和图片。</p><label>公开用户名<input data-public-input type="text" minlength="3" maxlength="31" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="seu_nome"></label>\n<p>3–30 个不带重音符号的字母、数字或下划线。用户名唯一，在账户存续期间不可更改。</p>\n<button type="button" class="primary" data-public-action="create">创建公开个人资料</button></div>\n<div data-public-owned hidden></div>\n<section data-public-moderation aria-label="被拒绝的公开文件"></section>\n<div><button type="button" data-public-action="moderation-latest" hidden>最新通知</button><button type="button" data-public-action="moderation-older" hidden>先前通知</button></div>\n<p data-external-media-status role="status"></p><button type="button" data-public-action="external-media">外部媒体</button>\n<p data-public-status role="status"></p><button type="button" data-public-action="reload" hidden>重试</button></article>',
  ],
  ' and {0} more {1}': [' and {0} more {1}', ' 以及另外 {0} 个{1}'],
  'Followed by ': ['Followed by ', '关注者 '],
  'html.b1c18c8a59fa': [
    '<div class="profile-editor">\n<div class="profile-editor-banner"><button type="button" class="profile-editor-pick" data-pick="banner" aria-label="Change banner"><img alt="" hidden><span class="profile-editor-hint">Change banner</span></button><button type="button" class="profile-editor-remove" data-remove="banner" aria-label="Remove banner" title="Remove banner" hidden>{0}</button></div>\n<div class="profile-editor-identity"><div class="profile-editor-avatar"><button type="button" class="profile-editor-pick" data-pick="avatar" aria-label="Change photo"><span data-avatar-slot>@</span></button><button type="button" class="profile-editor-remove" data-remove="avatar" aria-label="Remove photo" title="Remove photo" hidden>{1}</button></div>\n<div class="profile-editor-title"><h3 data-public-own-handle></h3><a data-public-page>View my public profile</a></div></div>\n<label class="profile-editor-description"><span>Description</span><textarea data-public-description rows="3" placeholder="Tell people about yourself. Use @ to mention users and communities."></textarea><small data-description-count></small></label>\n<button type="button" class="primary" data-confirm-profile>Confirm changes</button><input type="file" data-pick-file accept="image/png,image/jpeg,image/webp" hidden></div>',
    '<div class="profile-editor">\n<div class="profile-editor-banner"><button type="button" class="profile-editor-pick" data-pick="banner" aria-label="更换横幅"><img alt="" hidden><span class="profile-editor-hint">更换横幅</span></button><button type="button" class="profile-editor-remove" data-remove="banner" aria-label="移除横幅" title="移除横幅" hidden>{0}</button></div>\n<div class="profile-editor-identity"><div class="profile-editor-avatar"><button type="button" class="profile-editor-pick" data-pick="avatar" aria-label="更换图片"><span data-avatar-slot>@</span></button><button type="button" class="profile-editor-remove" data-remove="avatar" aria-label="移除图片" title="移除图片" hidden>{1}</button></div>\n<div class="profile-editor-title"><h3 data-public-own-handle></h3><a data-public-page>查看我的公开个人资料</a></div></div>\n<label class="profile-editor-description"><span>简介</span><textarea data-public-description rows="3" placeholder="介绍一下自己。使用 @ 提及用户和社区。"></textarea><small data-description-count></small></label>\n<button type="button" class="primary" data-confirm-profile>确认更改</button><input type="file" data-pick-file accept="image/png,image/jpeg,image/webp" hidden></div>',
  ],
  'html.3b7e1f6a5e79': [
    '<form role="search" aria-label="Search posts, users and communities"><label class="public-search-field">{0}<input type="search" placeholder="Search" aria-label="Search posts, users and communities" maxlength="100" autocomplete="off" spellcheck="false" aria-expanded="false"></label></form><div class="public-search-results" hidden><p class="public-search-status" role="status"></p><div class="public-search-list"></div></div>',
    '<form role="search" aria-label="搜索帖子、用户与社区"><label class="public-search-field">{0}<input type="search" placeholder="搜索" aria-label="搜索帖子、用户与社区" maxlength="100" autocomplete="off" spellcheck="false" aria-expanded="false"></label></form><div class="public-search-results" hidden><p class="public-search-status" role="status"></p><div class="public-search-list"></div></div>',
  ],
  'html.2d4c3af2bfc7': [
    '<legend>What to notify</legend><label><input type="checkbox" data-push-messages checked> Messages and replies</label><label><input type="checkbox" data-push-calls checked> Calls</label><label><input type="checkbox" data-push-show-calls checked> Identify the alert as a voice call</label><p>Turn off the last option for a generic alert. The contact\'s name is never shown; lock screen and sound depend on your system.</p><button type="button">Save push preferences</button>',
    '<legend>通知内容</legend><label><input type="checkbox" data-push-messages checked> 消息与回复</label><label><input type="checkbox" data-push-calls checked> 通话</label><label><input type="checkbox" data-push-show-calls checked> 将通知标识为语音来电</label><p>关闭最后一个选项可使用通用通知。不会显示联系人姓名；锁屏显示和声音由系统控制。</p><button type="button">保存推送设置</button>',
  ],
  ' · No linked domain. Issuer identified by wallet.': [
    ' · No linked domain. Issuer identified by wallet.',
    ' · 未关联域名。通过钱包识别签发者。',
  ],
  ' · {0}: {1}': [' · {0}: {1}', ' · {0}：{1}'],
  'html.3dee5155ad6c': [
    '<article class="card"><h2>Organizations and representatives</h2><p>Create an organization and issue signed authorizations. A website is optional; matching names do not verify an external brand.</p><p data-representative-notice role="status"></p><button type="button" data-representative-load>Open organizations and authorizations</button><div data-representative-list></div></article>',
    '<article class="card"><h2>组织与代表</h2><p>创建组织并签发已签名的授权。网站为选填；名称相同并不能证明外部品牌身份。</p><p data-representative-notice role="status"></p><button type="button" data-representative-load>打开组织与授权</button><div data-representative-list></div></article>',
  ],
  'html.198650fde984': [
    '<article class="card status-card"><h2>Status</h2><p data-status-notice role="status"></p><button data-status-refresh type="button">Refresh</button><div data-status-list></div><button data-status-more type="button" hidden>More statuses</button><section data-status-open aria-live="polite"></section></article><article class="card status-card"><h2>Your next status</h2><form data-status-compose><label>Text or caption<textarea data-status-text rows="3"></textarea></label><button data-status-emoji type="button">Choose emoji</button><input data-status-file type="file" accept="image/*" hidden aria-label="Status photo"><button data-status-attach type="button" class="media-picker-button" aria-label="Attach photo" title="Attach photo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/></svg></button><div data-status-preview></div><button data-status-clear-photo type="button">Remove photo</button><button data-status-publish class="primary" type="submit">Publish status</button><button data-status-cancel type="button" hidden>Cancel pending publication</button></form><p>Text and photos disappear after 24 hours and are excluded from backups.</p><details><summary>Who can see your next statuses</summary><p>All approved contacts can see by default. Uncheck anyone you want to exclude. New contacts are included in future publications.</p><p data-status-privacy-conflict hidden></p><div data-status-audience></div><button data-status-more-contacts type="button" hidden>More contacts</button><button data-status-save-audience type="button">Save privacy</button></details></article>',
    '<article class="card status-card"><h2>状态</h2><p data-status-notice role="status"></p><button data-status-refresh type="button">刷新</button><div data-status-list></div><button data-status-more type="button" hidden>更多状态</button><section data-status-open aria-live="polite"></section></article><article class="card status-card"><h2>你的下一条状态</h2><form data-status-compose><label>文字或说明<textarea data-status-text rows="3"></textarea></label><button data-status-emoji type="button">选择表情</button><input data-status-file type="file" accept="image/*" hidden aria-label="状态图片"><button data-status-attach type="button" class="media-picker-button" aria-label="附加图片" title="附加图片"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/></svg></button><div data-status-preview></div><button data-status-clear-photo type="button">移除图片</button><button data-status-publish class="primary" type="submit">发布状态</button><button data-status-cancel type="button" hidden>取消待发布内容</button></form><p>文字和图片在 24 小时后消失，不包含在备份中。</p><details><summary>谁可以查看你的后续状态</summary><p>默认所有已批准联系人均可查看。取消勾选要排除的人。新联系人将纳入后续发布。</p><p data-status-privacy-conflict hidden></p><div data-status-audience></div><button data-status-more-contacts type="button" hidden>更多联系人</button><button data-status-save-audience type="button">保存隐私设置</button></details></article>',
  ],
  'html.659a7a617631': [
    '<article class="card vault-card"><h2>Account storage</h2><progress data-vault-usage max="{0}" value="0" aria-label="Storage usage"></progress><p data-vault-quota></p><p data-vault-status role="status"></p><button data-vault-retry type="button" hidden>Try again</button></article>',
    '<article class="card vault-card"><h2>账户存储空间</h2><progress data-vault-usage max="{0}" value="0" aria-label="存储用量"></progress><p data-vault-quota></p><p data-vault-status role="status"></p><button data-vault-retry type="button" hidden>重试</button></article>',
  ],
  'html.a00be4e55c2e': [
    '<div class="vault-meter-row"><span>Vault</span><span data-vault-meter-label></span></div><progress max="{0}" aria-label="Vault usage"></progress>',
    '<div class="vault-meter-row"><span>保险库</span><span data-vault-meter-label></span></div><progress max="{0}" aria-label="保险库用量"></progress>',
  ],
  '. Choose one method per session; restart the command to begin again.': [
    '. Choose one method per session; restart the command to begin again.',
    '。每个会话请选择一种方式；如需重新开始，请重启命令。',
  ],
  '0xDMme — local recovery test': [
    '0xDMme — local recovery test',
    '0xDMme — 本地恢复测试',
  ],
  '0xDMme: a private web messenger in development.': [
    '0xDMme: a private web messenger in development.',
    '0xDMme：开发中的私密网页通信应用。',
  ],
  ': use fictional accounts and messages only': [
    ': use fictional accounts and messages only',
    '：仅使用虚构账户和消息',
  ],
  'The exclusive signature opens your vault. Check the message and sign only if you started this request. No code needs to be kept.':
    [
      'The exclusive signature opens your vault. Check the message and sign only if you started this request. No code needs to be kept.',
      '专用签名用于打开保险库。请核对消息，并仅在你发起此请求时签名。无需保存任何代码。',
    ],
  "This test's exclusive signature opens your package. Treat it as a secret; never share it. The laboratory does not display, record or send the signature.":
    [
      "This test's exclusive signature opens your package. Treat it as a secret; never share it. The laboratory does not display, record or send the signature.",
      '此测试的专用签名用于打开数据包。请将其视为秘密，切勿分享。实验环境不会显示、记录或发送签名。',
    ],
  'The temporary key is valid for five minutes and is deleted on completion, cancellation or resuming an expired test. If the browser closes, the record may remain until the next visit. Returning may open another tab or your default browser. This test does not demonstrate EVM support or closing old wallet tabs.':
    [
      'The temporary key is valid for five minutes and is deleted on completion, cancellation or resuming an expired test. If the browser closes, the record may remain until the next visit. Returning may open another tab or your default browser. This test does not demonstrate EVM support or closing old wallet tabs.',
      '临时密钥有效期为五分钟，会在完成、取消或恢复已过期测试时删除。如果关闭浏览器，记录可能保留到下次打开。返回可能打开另一标签页或默认浏览器。此测试不证明支持 EVM，也不证明会关闭旧钱包标签页。',
    ],
  'Open communities alongside': [
    'Open communities alongside',
    '在旁边打开社区',
  ],
  'Open history locally': ['Open history locally', '在本地打开历史'],
  'Open profile and settings': [
    'Open profile and settings',
    '打开个人资料与设置',
  ],
  'Semaphore 4.13.0 artifacts, depth-4 tree, served by this laboratory. No secrets are sent to an external service.':
    [
      'Semaphore 4.13.0 artifacts, depth-4 tree, served by this laboratory. No secrets are sent to an external service.',
      'Semaphore 4.13.0 文件及深度为 4 的树由此实验环境提供。不会向外部服务发送任何密钥。',
    ],
  'Sign recovery': ['Sign recovery', '签署恢复请求'],
  'Signatures and keys stay on clients; the return passes through the server encrypted. Signatures that differ from the original configuration prevent recovery.':
    [
      'Signatures and keys stay on clients; the return passes through the server encrypted. Signatures that differ from the original configuration prevent recovery.',
      '签名和密钥保留在客户端；返回结果以加密形式经过服务器。签名与初始配置不一致会导致无法恢复。',
    ],
  'Download the package and select that file to import. Check its identifier and click Test this package. Also test in a clean browser profile, using the same origin and original account.':
    [
      'Download the package and select that file to import. Check its identifier and click Test this package. Also test in a clean browser profile, using the same origin and original account.',
      '请下载数据包并选择该文件导入。核对标识后点击“测试此数据包”。也请使用相同来源和原账户，在全新浏览器配置中测试。',
    ],
  'Search contacts and messages': [
    'Search contacts and messages',
    '搜索联系人与消息',
  ],
  'Fetch envelope from relay': [
    'Fetch envelope from relay',
    '从中继获取加密封装',
  ],
  'Chat under test: use fictional accounts and messages only.': [
    'Chat under test: use fictional accounts and messages only.',
    '聊天测试中：仅使用虚构账户和消息。',
  ],
  "Other client's public key": [
    "Other client's public key",
    '另一客户端的公钥',
  ],
  'Test client': ['Test client', '测试客户端'],
  'Test client · 0xDMme': ['Test client · 0xDMme', '测试客户端 · 0xDMme'],
  'Vault and recovery': ['Vault and recovery', '保险库与恢复'],
  'Vault and clean recovery': [
    'Vault and clean recovery',
    '保险库与全新环境恢复',
  ],
  'Confirm your request in the wallet.': [
    'Confirm your request in the wallet.',
    '请在钱包中确认请求。',
  ],
  'I confirm I am using a test wallet and understand that this does not protect real data.':
    [
      'I confirm I am using a test wallet and understand that this does not protect real data.',
      '我确认使用测试钱包，并理解这不能保护真实数据。',
    ],
  'Contacts and groups': ['Contacts and groups', '联系人与群组'],
  'Contacts and profile': ['Contacts and profile', '联系人与个人资料'],
  'Contacts, conversation and communities': [
    'Contacts, conversation and communities',
    '联系人、对话与社区',
  ],
  'Content and secrets belong to your devices.': [
    'Content and secrets belong to your devices.',
    '内容和密钥属于你的设备。',
  ],
  'Copy full wallet address': ['Copy full wallet address', '复制完整钱包地址'],
  'Create the test. Check that both requests contain exactly the same message.':
    [
      'Create the test. Check that both requests contain exactly the same message.',
      '请创建测试。确认两次请求的消息完全一致。',
    ],
  'Then return to the original browser to finish. Choose which devices to revoke there.':
    [
      'Then return to the original browser to finish. Choose which devices to revoke there.',
      '然后返回原浏览器完成流程，并在那里选择撤销哪些设备。',
    ],
  'Emoji artwork and licenses': [
    'Emoji artwork and licenses',
    '表情图案与许可证',
  ],
  'Local recovery test': ['Local recovery test', '本地恢复测试'],
  'Test ready; no real wallet needed.': [
    'Test ready; no real wallet needed.',
    '测试已就绪；无需真实钱包。',
  ],
  'Send encrypted': ['Send encrypted', '加密发送'],
  'This test requests a connection and a test message signature. It does not create an account, send transactions or access your history.':
    [
      'This test requests a connection and a test message signature. It does not create an account, send transactions or access your history.',
      '此测试请求连接并签署测试消息。不会创建账户、发送交易或访问历史。',
    ],
  "This session is temporary: restarting the laboratory discards messages and keys. It is not yet the product's chat.":
    [
      "This session is temporary: restarting the laboratory discards messages and keys. It is not yet the product's chat.",
      '此会话为临时会话：重启实验环境会丢弃消息和密钥。它尚不是产品聊天功能。',
    ],
  'Messaging engine sources': ['Messaging engine sources', '消息引擎源代码'],
  'Sources and licenses for this version': [
    'Sources and licenses for this version',
    '此版本的源代码与许可证',
  ],
  'Sources and licenses: local repository. Local use; publication of this test has not been approved.':
    [
      'Sources and licenses: local repository. Local use; publication of this test has not been approved.',
      '源代码与许可证：本地仓库。仅供本地使用；此测试尚未获准发布。',
    ],
  'Generate fictional secret': ['Generate fictional secret', '生成虚构密钥'],
  'ZK generation and verification': [
    'ZK generation and verification',
    '零知识证明生成与验证',
  ],
  'Store envelope on relay': ['Store envelope on relay', '将加密封装存入中继'],
  'Keep the secret for the test; it is never sent to the relay. Open this page in another browser and fetch the envelope to test recovery in a clean environment.':
    [
      'Keep the secret for the test; it is never sent to the relay. Open this page in another browser and fetch the envelope to test recovery in a clean environment.',
      '请保留用于测试的密钥；密钥绝不会发送到中继。在另一浏览器中打开此页并获取加密封装，可以测试全新环境中的恢复。',
    ],
  '0xDMme · vault test': ['0xDMme · vault test', '0xDMme · 保险库测试'],
  '0xDMme · cryptography laboratory': [
    '0xDMme · cryptography laboratory',
    '0xDMme · 加密实验环境',
  ],
  'Fictional history recovered in a clean browser.': [
    'Fictional history recovered in a clean browser.',
    '虚构历史已在全新浏览器环境中恢复。',
  ],
  'Recovered history': ['Recovered history', '已恢复历史'],
  'Import encrypted fictional package, processed in this browser': [
    'Import encrypted fictional package, processed in this browser',
    '导入加密虚构数据包，在此浏览器中处理',
  ],
  'Skip to content': ['Skip to content', '跳转到内容'],
  'Cryptography laboratory': ['Cryptography laboratory', '加密实验环境'],
  "45-second limit; workers stop on completion or exit. Results do not replace Android/iOS measurements. The generator's GPL-3.0 license requires assessment before product distribution.":
    [
      "45-second limit; workers stop on completion or exit. Results do not replace Android/iOS measurements. The generator's GPL-3.0 license requires assessment before product distribution.",
      '限时 45 秒；完成或退出时停止工作线程。结果不能替代 Android/iOS 实测。产品分发前需要评估生成器的 GPL-3.0 许可证。',
    ],
  'Conversation list': ['Conversation list', '对话列表'],
  'Fictional message': ['Fictional message', '虚构消息'],
  'Messages via @': ['Messages via @', '通过 @ 发送的私信'],
  'My public key': ['My public key', '我的公钥'],
  'Main navigation': ['Main navigation', '主导航'],
  Unread: ['Unread', '未读'],
  'The selected file becomes the recovery target. Check the account and active package identifier below.':
    [
      'The selected file becomes the recovery target. Check the account and active package identifier below.',
      '所选文件将成为恢复目标。请核对下方账户与当前数据包标识。',
    ],
  'Sign-in completes in the tab or PWA that started the request. If the return opens another tab or stays in the wallet, manually return to the original browser.':
    [
      'Sign-in completes in the tab or PWA that started the request. If the return opens another tab or stays in the wallet, manually return to the original browser.',
      '登录将在发起请求的标签页或 PWA 中完成。如果返回打开另一标签页或停留在钱包，请手动返回原浏览器。',
    ],
  'The relay is temporary. Valid historical backups can be opened, but do not reauthorize devices. Wallet authentication and protection against current-state rollback are deferred to integration.':
    [
      'The relay is temporary. Valid historical backups can be opened, but do not reauthorize devices. Wallet authentication and protection against current-state rollback are deferred to integration.',
      '中继为临时服务。有效历史备份可以打开，但不会重新授权设备。钱包认证及当前状态回滚保护将在集成阶段实现。',
    ],
  'Group options': ['Group options', '群组选项'],
  'Screen layout': ['Screen layout', '界面布局'],
  'Preparing test channel…': ['Preparing test channel…', '正在准备测试通道…'],
  'Ready to measure in this browser.': [
    'Ready to measure in this browser.',
    '可以在此浏览器中测量。',
  ],
  'Phantom return test · 0xDMme': [
    'Phantom return test · 0xDMme',
    'Phantom 返回测试 · 0xDMme',
  ],
  Public: ['Public', '公开'],
  'PRIVATE RECOVERY': ['PRIVATE RECOVERY', '私密恢复'],
  'Reload this page and click Test this package.': [
    'Reload this page and click Test this package.',
    '请刷新此页并点击“测试此数据包”。',
  ],
  'Show or hide side panel': ['Show or hide side panel', '显示或隐藏侧边栏'],
  'Private recovery · 0xDMme': [
    'Private recovery · 0xDMme',
    '私密恢复 · 0xDMme',
  ],
  'Phantom return': ['Phantom return', 'Phantom 返回'],
  'Snapshot revision': ['Snapshot revision', '快照修订版本'],
  'Revoke another device and test rotation': [
    'Revoke another device and test rotation',
    '撤销其他设备授权并测试轮换',
  ],
  'Fictional recovery secret': ['Fictional recovery secret', '虚构恢复密钥'],
  'Select your test wallet.': ['Select your test wallet.', '请选择测试钱包。'],
  'Semaphore: membership in a group of eight fictional identities. This does not integrate sign-in, chat or wallets, and does not demonstrate anonymity in this small group.':
    [
      'Semaphore: membership in a group of eight fictional identities. This does not integrate sign-in, chat or wallets, and does not demonstrate anonymity in this small group.',
      'Semaphore：证明属于包含八个虚构身份的群组。此测试不集成登录、聊天或钱包，也不证明此小群组中的匿名性。',
    ],
  'Community sections': ['Community sections', '社区分区'],
  'Fictional data and an unfunded test wallet only. This laboratory does not access your 0xDMme account or vault.':
    [
      'Fictional data and an unfunded test wallet only. This laboratory does not access your 0xDMme account or vault.',
      '仅使用虚构数据和无资金的测试钱包。此实验环境不会访问你的 0xDMme 账户或保险库。',
    ],
  'Fictional messages only; temporary storage.': [
    'Fictional messages only; temporary storage.',
    '仅使用虚构消息；临时存储。',
  ],
  'Communities only': ['Communities only', '仅社区'],
  'Conversations only': ['Conversations only', '仅对话'],
  'Test connection and return': [
    'Test connection and return',
    '测试连接与返回',
  ],
  'Fictional history text': ['Fictional history text', '虚构历史文字'],
  'Contact type': ['Contact type', '联系人类型'],
  'Switch accounts in the wallet: recovery must reject a different account.': [
    'Switch accounts in the wallet: recovery must reject a different account.',
    '请在钱包中切换账户：恢复必须拒绝不同账户。',
  ],
  'A positive result here does not prove compatibility across wallets, devices or future updates. QR linking and current recovery remain in the app.':
    [
      'A positive result here does not prove compatibility across wallets, devices or future updates. QR linking and current recovery remain in the app.',
      '此处成功不代表钱包、设备或未来更新之间的兼容性。应用仍保留二维码关联和现有恢复流程。',
    ],
  'A new version is ready.': ['A new version is ready.', '新版本已就绪。'],
  "Use fictional text and secrets only. Synthetic identity: Alice. This page does not use messaging clients' state.":
    [
      "Use fictional text and secrets only. Synthetic identity: Alice. This page does not use messaging clients' state.",
      '仅使用虚构文字和密钥。模拟身份：Alice。此页面不使用消息客户端状态。',
    ],
  'Use fictional text only. Compare the keys on both screens, authorize and send a message.':
    [
      'Use fictional text only. Compare the keys on both screens, authorize and send a message.',
      '仅使用虚构文字。请比较两个页面上的密钥，授权后发送消息。',
    ],
  'Checking connection…': ['Checking connection…', '正在检查连接…'],
  'Test wallet': ['Test wallet', '测试钱包'],
  'App workspace': ['App workspace', '应用工作区'],
  'Changing language reloads the screen. Resolve your drafts before continuing.':
    [
      'Changing language reloads the screen. Resolve your drafts before continuing.',
      '更改语言需要刷新界面。继续前请先处理草稿。',
    ],
  '@{0} replied · 0xDMme': ['@{0} replied · 0xDMme', '@{0} 回复了 · 0xDMme'],
  '@{0} posted · 0xDMme': ['@{0} posted · 0xDMme', '@{0} 发布了 · 0xDMme'],
  'New activity. Open the app to sync.': [
    'New activity. Open the app to sync.',
    '有新动态。请打开应用以同步。',
  ],
  'Invalid handle.': ['Invalid handle.', '用户名无效。'],
  'Invalid profile tab.': ['Invalid profile tab.', '个人资料标签页无效。'],
  'Opening request missing.': ['Opening request missing.', '缺少打开请求。'],
  'Account opening unavailable.': [
    'Account opening unavailable.',
    '账户打开流程不可用。',
  ],
  'Invalid message algorithm.': [
    'Invalid message algorithm.',
    '消息算法无效。',
  ],
  'Invalid session algorithm.': [
    'Invalid session algorithm.',
    '会话算法无效。',
  ],
  'Invalid group change.': ['Invalid group change.', '群组更改无效。'],
  'Invalid private change.': ['Invalid private change.', '私密更改无效。'],
  'Report target unavailable.': [
    'Report target unavailable.',
    '举报对象不可用。',
  ],
  'Media analysis unavailable.': [
    'Media analysis unavailable.',
    '媒体分析不可用。',
  ],
  'Attachment incomplete.': ['Attachment incomplete.', '附件不完整。'],
  'Attachment unavailable.': ['Attachment unavailable.', '附件不可用。'],
  'Full attachment does not match.': [
    'Full attachment does not match.',
    '完整附件不匹配。',
  ],
  'DM device unavailable.': ['DM device unavailable.', '私信设备不可用。'],
  'Attachment storage unavailable.': [
    'Attachment storage unavailable.',
    '附件存储不可用。',
  ],
  'Media storage unavailable.': [
    'Media storage unavailable.',
    '媒体存储不可用。',
  ],
  'Status storage unavailable.': [
    'Status storage unavailable.',
    '状态存储不可用。',
  ],
  'Invalid tree.': ['Invalid tree.', '树结构无效。'],
  'Signature missing.': ['Signature missing.', '缺少签名。'],
  'Invalid authorization signature.': [
    'Invalid authorization signature.',
    '授权签名无效。',
  ],
  'Invalid group signature.': ['Invalid group signature.', '群组签名无效。'],
  'Invalid message signature.': [
    'Invalid message signature.',
    '消息签名无效。',
  ],
  'Invalid package signature.': [
    'Invalid package signature.',
    '数据包签名无效。',
  ],
  'Invalid Matrix signature.': [
    'Invalid Matrix signature.',
    'Matrix 签名无效。',
  ],
  'Invalid shared activity.': ['Invalid shared activity.', '分享的动态无效。'],
  'Live update unavailable.': ['Live update unavailable.', '实时更新不可用。'],
  'Invalid group audience.': ['Invalid group audience.', '群组受众无效。'],
  'Invalid status audience.': ['Invalid status audience.', '状态受众无效。'],
  'Deletion authority does not match.': [
    'Deletion authority does not match.',
    '删除授权不匹配。',
  ],
  'Historical authority unavailable.': [
    'Historical authority unavailable.',
    '历史授权不可用。',
  ],
  'Authorization unavailable.': ['Authorization unavailable.', '授权不可用。'],
  'Invalid authorization.': ['Invalid authorization.', '授权无效。'],
  'Authorizations unavailable.': [
    'Authorizations unavailable.',
    '授权不可用。',
  ],
  'Invalid public avatar.': ['Invalid public avatar.', '公开头像无效。'],
  'Invalid video notice.': ['Invalid video notice.', '视频通知无效。'],
  'Badge unavailable.': ['Badge unavailable.', '徽章不可用。'],
  'Invalid badge.': ['Invalid badge.', '徽章无效。'],
  'Invalid badges.': ['Invalid badges.', '徽章无效。'],
  'Block unavailable.': ['Block unavailable.', '屏蔽记录不可用。'],
  'Invalid mention search.': ['Invalid mention search.', '提及搜索无效。'],
  'Invalid approval path.': ['Invalid approval path.', '批准路径无效。'],
  'Invalid fields.': ['Invalid fields.', '字段无效。'],
  'Invalid DM identity capsule.': [
    'Invalid DM identity capsule.',
    '私信身份封装无效。',
  ],
  'Recovery capsule corrupted.': [
    'Recovery capsule corrupted.',
    '恢复封装已损坏。',
  ],
  'Invalid recovery capsule.': ['Invalid recovery capsule.', '恢复封装无效。'],
  'Card exceeds the limit.': ['Card exceeds the limit.', '卡片超过限制。'],
  'Call unavailable.': ['Call unavailable.', '通话不可用。'],
  'Invalid call.': ['Invalid call.', '通话无效。'],
  'Historical key missing.': ['Historical key missing.', '缺少历史密钥。'],
  'Group Matrix key does not match.': [
    'Group Matrix key does not match.',
    '群组 Matrix 密钥不匹配。',
  ],
  'Source Matrix key does not match.': [
    'Source Matrix key does not match.',
    '来源 Matrix 密钥不匹配。',
  ],
  'Invalid Matrix key.': ['Invalid Matrix key.', 'Matrix 密钥无效。'],
  'Invalid status key or signature.': [
    'Invalid status key or signature.',
    '状态密钥或签名无效。',
  ],
  'Invalid subscription keys.': [
    'Invalid subscription keys.',
    '订阅密钥无效。',
  ],
  'Invalid Matrix ciphertext.': [
    'Invalid Matrix ciphertext.',
    'Matrix 密文无效。',
  ],
  'Invalid classification.': ['Invalid classification.', '分类无效。'],
  'Analysis coverage incomplete.': [
    'Analysis coverage incomplete.',
    '分析覆盖范围不完整。',
  ],
  'Invalid encoding.': ['Invalid encoding.', '编码无效。'],
  'Code or keys do not match.': [
    'Code or keys do not match.',
    '代码或密钥不匹配。',
  ],
  'Share unavailable.': ['Share unavailable.', '分享不可用。'],
  'Invalid feed community.': ['Invalid feed community.', '动态中的社区无效。'],
  'Invalid public community.': ['Invalid public community.', '公开社区无效。'],
  'Invalid recovery configuration.': [
    'Invalid recovery configuration.',
    '恢复配置无效。',
  ],
  'Invalid configuration.': ['Invalid configuration.', '配置无效。'],
  'Wallet confirmation or device authorization missing.': [
    'Wallet confirmation or device authorization missing.',
    '缺少钱包确认或设备授权。',
  ],
  'DM confirmation does not match.': [
    'DM confirmation does not match.',
    '私信确认不匹配。',
  ],
  'DM confirmations exceeds the limit.': [
    'DM confirmations exceeds the limit.',
    '私信确认超过限制。',
  ],
  'Invalid Matrix account.': ['Invalid Matrix account.', 'Matrix 账户无效。'],
  'Invalid group vault accounting.': [
    'Invalid group vault accounting.',
    '群组保险库计量无效。',
  ],
  'Invalid count.': ['Invalid count.', '计数无效。'],
  'Invalid counts.': ['Invalid counts.', '计数无效。'],
  'Contact unavailable.': ['Contact unavailable.', '联系人不可用。'],
  'Appeal unavailable.': ['Appeal unavailable.', '申诉不可用。'],
  'Deletion content does not match.': [
    'Deletion content does not match.',
    '删除内容不匹配。',
  ],
  'Invalid reply context.': ['Invalid reply context.', '回复上下文无效。'],
  'Invalid analysis context.': [
    'Invalid analysis context.',
    '分析上下文无效。',
  ],
  'Invalid context.': ['Invalid context.', '上下文无效。'],
  'Group controls unavailable.': [
    'Group controls unavailable.',
    '群组控制项不可用。',
  ],
  'Group invitation unavailable.': [
    'Group invitation unavailable.',
    '群组邀请不可用。',
  ],
  'Invalid invitation or transfer.': [
    'Invalid invitation or transfer.',
    '邀请或转让无效。',
  ],
  'Invalid approval cookie.': ['Invalid approval cookie.', '批准 Cookie无效。'],
  'Invalid body.': ['Invalid body.', '请求正文无效。'],
  'Invalid discussion cursor.': [
    'Invalid discussion cursor.',
    '讨论游标无效。',
  ],
  'Invalid discovery cursor.': ['Invalid discovery cursor.', '发现游标无效。'],
  'Invalid post cursor.': ['Invalid post cursor.', '帖子游标无效。'],
  'Invalid ranking cursor.': ['Invalid ranking cursor.', '排行榜游标无效。'],
  'Invalid cursor.': ['Invalid cursor.', '游标无效。'],
  'Invalid data.': ['Invalid data.', '数据无效。'],
  'Invalid community date.': ['Invalid community date.', '社区日期无效。'],
  'Invalid analysis decision.': [
    'Invalid analysis decision.',
    '分析决定无效。',
  ],
  'Invalid decision.': ['Invalid decision.', '决定无效。'],
  'Report unavailable.': ['Report unavailable.', '举报不可用。'],
  'Domain challenge missing.': [
    'Domain challenge missing.',
    '缺少域名验证请求。',
  ],
  'Invalid return challenge.': [
    'Invalid return challenge.',
    '返回验证请求无效。',
  ],
  'Invalid challenge.': ['Invalid challenge.', '验证请求无效。'],
  'Discovery unavailable.': ['Discovery unavailable.', '发现设置不可用。'],
  'Invalid audio description.': [
    'Invalid audio description.',
    '音频描述无效。',
  ],
  'Invalid description.': ['Invalid description.', '简介无效。'],
  'Status recipient does not match.': [
    'Status recipient does not match.',
    '状态接收者不匹配。',
  ],
  'Invalid status recipient.': [
    'Invalid status recipient.',
    '状态接收者无效。',
  ],
  'Message recipients do not match.': [
    'Message recipients do not match.',
    '消息接收者不匹配。',
  ],
  'Recipients exceed the limit.': [
    'Recipients exceed the limit.',
    '接收者超过限制。',
  ],
  'Recipients or group origin do not match.': [
    'Recipients or group origin do not match.',
    '接收者或群组来源不匹配。',
  ],
  'Cryptographic destination does not match.': [
    'Cryptographic destination does not match.',
    '加密目标不匹配。',
  ],
  'Invalid opening destination.': [
    'Invalid opening destination.',
    '打开目标无效。',
  ],
  'Invalid recovery destination.': [
    'Invalid recovery destination.',
    '恢复目标无效。',
  ],
  'Device directory missing.': ['Device directory missing.', '缺少设备目录。'],
  'Invalid group directory.': ['Invalid group directory.', '群组目录无效。'],
  'Participant directory unavailable.': [
    'Participant directory unavailable.',
    '成员目录不可用。',
  ],
  'Invalid directory.': ['Invalid directory.', '目录无效。'],
  'Invalid availability.': ['Invalid availability.', '可用性无效。'],
  'Approval document unavailable.': [
    'Approval document unavailable.',
    '批准文档不可用。',
  ],
  'Invalid approval document.': [
    'Invalid approval document.',
    '批准文档无效。',
  ],
  'Document exceeds the limit.': [
    'Document exceeds the limit.',
    '文档超过限制。',
  ],
  'Invalid domain.': ['Invalid domain.', '域名无效。'],
  'Invalid public domain.': ['Invalid public domain.', '公开域名无效。'],
  'Invalid duration.': ['Invalid duration.', '时长无效。'],
  'Invalid ecosystem.': ['Invalid ecosystem.', '生态系统无效。'],
  'Issuer/context does not match.': [
    'Issuer/context does not match.',
    '签发者或上下文不匹配。',
  ],
  'Invalid relay address.': ['Invalid relay address.', '中继地址无效。'],
  'Invalid endpoint.': ['Invalid endpoint.', '端点无效。'],
  'Invalid link entry.': ['Invalid link entry.', '链接入口无效。'],
  'Return envelope exceeds the limit.': [
    'Return envelope exceeds the limit.',
    '返回封装超过限制。',
  ],
  'Invalid vault envelope.': ['Invalid vault envelope.', '保险库封装无效。'],
  'Invalid recovery epoch.': ['Invalid recovery epoch.', '恢复周期无效。'],
  'Invalid epoch or revision.': [
    'Invalid epoch or revision.',
    '周期或修订版本无效。',
  ],
  'Invalid media error.': ['Invalid media error.', '媒体错误无效。'],
  'Invalid choice.': ['Invalid choice.', '选项无效。'],
  'Invalid analysis state.': ['Invalid analysis state.', '分析状态无效。'],
  'Invalid call state.': ['Invalid call state.', '通话状态无效。'],
  'Message state missing.': ['Message state missing.', '缺少消息状态。'],
  'Invalid post state.': ['Invalid post state.', '帖子状态无效。'],
  'Invalid state.': ['Invalid state.', '状态无效。'],
  'Invalid Matrix fallback key.': [
    'Invalid Matrix fallback key.',
    'Matrix 备用密钥无效。',
  ],
  'Invalid feed.': ['Invalid feed.', '动态无效。'],
  'Invalid filters.': ['Invalid filters.', '筛选条件无效。'],
  'Media fingerprint missing.': [
    'Media fingerprint missing.',
    '缺少媒体指纹。',
  ],
  'Invalid prepared photo format.': [
    'Invalid prepared photo format.',
    '已处理图片格式无效。',
  ],
  'Invalid vault format.': ['Invalid vault format.', '保险库格式无效。'],
  'Full photo does not match.': [
    'Full photo does not match.',
    '完整图片不匹配。',
  ],
  'Invalid group role.': ['Invalid group role.', '群组角色无效。'],
  'Invalid role.': ['Invalid role.', '角色无效。'],
  'Invalid public role.': ['Invalid public role.', '公开角色无效。'],
  'Invalid admission time.': ['Invalid admission time.', '接纳时间无效。'],
  'Invalid post time.': ['Invalid post time.', '帖子时间无效。'],
  'Linking identity does not match.': [
    'Linking identity does not match.',
    '关联身份不匹配。',
  ],
  'Matrix identity does not match.': [
    'Matrix identity does not match.',
    'Matrix 身份不匹配。',
  ],
  'Invalid wallet identity or network.': [
    'Invalid wallet identity or network.',
    '钱包身份或网络无效。',
  ],
  'Invalid key identifier.': ['Invalid key identifier.', '密钥标识无效。'],
  'Invalid identifier.': ['Invalid identifier.', '标识无效。'],
  'Media inspection unavailable.': [
    'Media inspection unavailable.',
    '媒体检查不可用。',
  ],
  'Invalid creation window.': ['Invalid creation window.', '创建窗口无效。'],
  'Invalid JSON.': ['Invalid JSON.', 'JSON无效。'],
  'Invalid group link.': ['Invalid group link.', '群组链接无效。'],
  'Invalid post list.': ['Invalid post list.', '帖子列表无效。'],
  'Invalid follower list.': ['Invalid follower list.', '关注者列表无效。'],
  'Invalid list.': ['Invalid list.', '列表无效。'],
  'DM key batch exceeds the limit.': [
    'DM key batch exceeds the limit.',
    '私信密钥批次超过限制。',
  ],
  'Key batch exceeds the limit.': [
    'Key batch exceeds the limit.',
    '密钥批次超过限制。',
  ],
  'Matrix key batch exceeds the limit.': [
    'Matrix key batch exceeds the limit.',
    'Matrix 密钥批次超过限制。',
  ],
  'Invalid confirmation batch.': [
    'Invalid confirmation batch.',
    '确认批次无效。',
  ],
  'Key lookup batch exceeds the limit.': [
    'Key lookup batch exceeds the limit.',
    '密钥查询批次超过限制。',
  ],
  'Contact batch exceeds the limit.': [
    'Contact batch exceeds the limit.',
    '联系人批次超过限制。',
  ],
  'Directory batch exceeds the limit.': [
    'Directory batch exceeds the limit.',
    '目录批次超过限制。',
  ],
  'Envelope batch exceeds the limit.': [
    'Envelope batch exceeds the limit.',
    '封装批次超过限制。',
  ],
  'Invalid envelope batch.': ['Invalid envelope batch.', '封装批次无效。'],
  'Invalid group batch.': ['Invalid group batch.', '群组批次无效。'],
  'Cleanup batch exceeds the limit.': [
    'Cleanup batch exceeds the limit.',
    '清理批次超过限制。',
  ],
  'Invalid message batch.': ['Invalid message batch.', '消息批次无效。'],
  'Invalid participant batch.': [
    'Invalid participant batch.',
    '成员批次无效。',
  ],
  'Period batch exceeds the limit.': [
    'Period batch exceeds the limit.',
    '时段批次超过限制。',
  ],
  'Invalid receipt batch.': ['Invalid receipt batch.', '接收批次无效。'],
  'Recovery batch exceeds the limit.': [
    'Recovery batch exceeds the limit.',
    '恢复批次超过限制。',
  ],
  'Session batch exceeds the limit.': [
    'Session batch exceeds the limit.',
    '会话批次超过限制。',
  ],
  'View batch exceeds the limit.': [
    'View batch exceeds the limit.',
    '浏览批次超过限制。',
  ],
  'Invalid view batch.': ['Invalid view batch.', '浏览批次无效。'],
  'Invalid batch.': ['Invalid batch.', '批次无效。'],
  'Invalid view marker.': ['Invalid view marker.', '浏览标记无效。'],
  'Mentions unavailable.': ['Mentions unavailable.', '提及不可用。'],
  'Group message exceeds the limit.': [
    'Group message exceeds the limit.',
    '群组消息超过限制。',
  ],
  'Group message and recovery do not match.': [
    'Group message and recovery do not match.',
    '群组消息与恢复信息不匹配。',
  ],
  'Original message does not match.': [
    'Original message does not match.',
    '原始消息不匹配。',
  ],
  'Original message unavailable.': [
    'Original message unavailable.',
    '原始消息不可用。',
  ],
  'Own message unavailable.': [
    'Own message unavailable.',
    '自己的消息不可用。',
  ],
  'Invalid approval metadata.': [
    'Invalid approval metadata.',
    '批准元数据无效。',
  ],
  'Invalid media metadata.': ['Invalid media metadata.', '媒体元数据无效。'],
  'Invalid method.': ['Invalid method.', '方法无效。'],
  'DM media unavailable.': ['DM media unavailable.', '私信媒体不可用。'],
  'Status media unavailable.': [
    'Status media unavailable.',
    '状态媒体不可用。',
  ],
  'Group media unavailable.': ['Group media unavailable.', '群组媒体不可用。'],
  'Media unavailable.': ['Media unavailable.', '媒体不可用。'],
  'Full media does not match.': [
    'Full media does not match.',
    '完整媒体不匹配。',
  ],
  'Invalid public media.': ['Invalid public media.', '公开媒体无效。'],
  'Invalid thumbnail.': ['Invalid thumbnail.', '缩略图无效。'],
  'Invalid approval mode.': ['Invalid approval mode.', '批准模式无效。'],
  'Invalid negotiation.': ['Invalid negotiation.', '协商无效。'],
  'Invalid community name.': ['Invalid community name.', '社区名称无效。'],
  'Invalid mention name.': ['Invalid mention name.', '提及名称无效。'],
  'Invalid name.': ['Invalid name.', '名称无效。'],
  'Notifications unavailable.': ['Notifications unavailable.', '通知不可用。'],
  'Invalid vault number.': ['Invalid vault number.', '保险库编号无效。'],
  'Invalid analysis object.': ['Invalid analysis object.', '分析对象无效。'],
  'Invalid cleanup object.': ['Invalid cleanup object.', '清理对象无效。'],
  'Invalid DM option.': ['Invalid DM option.', '私信选项无效。'],
  'Community operation unavailable.': [
    'Community operation unavailable.',
    '社区操作不可用。',
  ],
  'Invalid badge operation.': ['Invalid badge operation.', '徽章操作无效。'],
  'Call operation unavailable.': [
    'Call operation unavailable.',
    '通话操作不可用。',
  ],
  'DM operation unavailable.': [
    'DM operation unavailable.',
    '私信操作不可用。',
  ],
  'Group operation unavailable.': [
    'Group operation unavailable.',
    '群组操作不可用。',
  ],
  'Message operation unavailable.': [
    'Message operation unavailable.',
    '消息操作不可用。',
  ],
  'Media operation unavailable.': [
    'Media operation unavailable.',
    '媒体操作不可用。',
  ],
  'Post operation unavailable.': [
    'Post operation unavailable.',
    '帖子操作不可用。',
  ],
  'Status operation unavailable.': [
    'Status operation unavailable.',
    '状态操作不可用。',
  ],
  'Tag operation unavailable.': [
    'Tag operation unavailable.',
    '标签操作不可用。',
  ],
  'Daily operation unavailable.': [
    'Daily operation unavailable.',
    '每日操作不可用。',
  ],
  'Invalid discussion ordering.': [
    'Invalid discussion ordering.',
    '讨论排序无效。',
  ],
  'Invalid ordering.': ['Invalid ordering.', '排序无效。'],
  'Organization tampered with.': [
    'Organization tampered with.',
    '组织遭到篡改。',
  ],
  'Organization unavailable.': ['Organization unavailable.', '组织不可用。'],
  'Invalid organization.': ['Invalid organization.', '组织无效。'],
  'Invalid authorization origin.': [
    'Invalid authorization origin.',
    '授权来源无效。',
  ],
  'Invalid mention origin.': ['Invalid mention origin.', '提及来源无效。'],
  'Recovery origin missing.': ['Recovery origin missing.', '缺少恢复来源。'],
  'Invalid approval origin.': ['Invalid approval origin.', '批准来源无效。'],
  'Invalid media origin.': ['Invalid media origin.', '媒体来源无效。'],
  'Invalid recovery origin.': ['Invalid recovery origin.', '恢复来源无效。'],
  'Status origin does not match.': [
    'Status origin does not match.',
    '状态来源不匹配。',
  ],
  'Invalid view origin.': ['Invalid view origin.', '浏览来源无效。'],
  'Invalid group package.': ['Invalid group package.', '群组数据包无效。'],
  'Invalid message package.': ['Invalid message package.', '消息数据包无效。'],
  'Invalid community page.': ['Invalid community page.', '社区页面无效。'],
  'Audience page exceeds the limit.': [
    'Audience page exceeds the limit.',
    '受众页面超过限制。',
  ],
  'Invalid recipient page.': ['Invalid recipient page.', '接收者页面无效。'],
  'Invalid DM page.': ['Invalid DM page.', '私信页面无效。'],
  'Invalid mention page.': ['Invalid mention page.', '提及页面无效。'],
  'Media page exceeds the limit.': [
    'Media page exceeds the limit.',
    '媒体页面超过限制。',
  ],
  'Recovery page unavailable.': [
    'Recovery page unavailable.',
    '恢复页面不可用。',
  ],
  'Invalid page.': ['Invalid page.', '页面无效。'],
  'Public page unavailable.': ['Public page unavailable.', '公开页面不可用。'],
  'Media part does not match.': [
    'Media part does not match.',
    '媒体分片不匹配。',
  ],
  'Invalid part.': ['Invalid part.', '分片无效。'],
  'Invalid attachment parts.': ['Invalid attachment parts.', '附件分片无效。'],
  'Membership unavailable.': ['Membership unavailable.', '成员身份不可用。'],
  'Invalid return request.': ['Invalid return request.', '返回请求无效。'],
  'Invalid wallet request.': ['Invalid wallet request.', '钱包请求无效。'],
  'Invalid encrypted profile.': [
    'Invalid encrypted profile.',
    '加密个人资料无效。',
  ],
  'Invalid period.': ['Invalid period.', '时段无效。'],
  'Invalid analysis policy.': ['Invalid analysis policy.', '分析政策无效。'],
  'Invalid authorization deadline.': [
    'Invalid authorization deadline.',
    '授权期限无效。',
  ],
  'Invalid analysis deadline.': [
    'Invalid analysis deadline.',
    '分析期限无效。',
  ],
  'Invalid call preference.': ['Invalid call preference.', '通话设置无效。'],
  'Preference unavailable.': ['Preference unavailable.', '偏好设置不可用。'],
  'Invalid push preferences.': ['Invalid push preferences.', '推送设置无效。'],
  'DM media preservation unavailable.': [
    'DM media preservation unavailable.',
    '私信媒体保留不可用。',
  ],
  'Invalid reply preview.': ['Invalid reply preview.', '回复预览无效。'],
  'Processor unavailable.': ['Processor unavailable.', '处理器不可用。'],
  'Isolated processor unavailable.': [
    'Isolated processor unavailable.',
    '隔离处理器不可用。',
  ],
  'Group ownership does not match.': [
    'Group ownership does not match.',
    '群组所有权不匹配。',
  ],
  'Invalid media quantity.': ['Invalid media quantity.', '媒体数量无效。'],
  'Invalid frame quantity.': ['Invalid frame quantity.', '帧数无效。'],
  'Group recovery exceeds the limit.': [
    'Group recovery exceeds the limit.',
    '群组恢复信息超过限制。',
  ],
  'Invalid group recovery.': ['Invalid group recovery.', '群组恢复信息无效。'],
  'Invalid avatar reference.': ['Invalid avatar reference.', '头像引用无效。'],
  'Invalid notification reference.': [
    'Invalid notification reference.',
    '通知引用无效。',
  ],
  'Recovery reference does not match.': [
    'Recovery reference does not match.',
    '恢复引用不匹配。',
  ],
  'Invalid attachment references.': [
    'Invalid attachment references.',
    '附件引用无效。',
  ],
  'Status references do not match.': [
    'Status references do not match.',
    '状态引用不匹配。',
  ],
  'Send references do not match.': [
    'Send references do not match.',
    '发送引用不匹配。',
  ],
  'Invalid creation record.': ['Invalid creation record.', '创建记录无效。'],
  'Invalid DM relationship.': ['Invalid DM relationship.', '私信关系无效。'],
  'Invalid message relationship.': [
    'Invalid message relationship.',
    '消息关系无效。',
  ],
  'Removal unavailable.': ['Removal unavailable.', '移除记录不可用。'],
  'Attachment reservation does not match.': [
    'Attachment reservation does not match.',
    '附件预留不匹配。',
  ],
  'Attachment reservation unavailable.': [
    'Attachment reservation unavailable.',
    '附件预留不可用。',
  ],
  'DM media reservation does not match.': [
    'DM media reservation does not match.',
    '私信媒体预留不匹配。',
  ],
  'DM media reservation unavailable.': [
    'DM media reservation unavailable.',
    '私信媒体预留不可用。',
  ],
  'Media reservation does not match.': [
    'Media reservation does not match.',
    '媒体预留不匹配。',
  ],
  'Status reservation does not match.': [
    'Status reservation does not match.',
    '状态预留不匹配。',
  ],
  'Replies unavailable.': ['Replies unavailable.', '回复不可用。'],
  'Invalid analysis result.': ['Invalid analysis result.', '分析结果无效。'],
  'Invalid media result.': ['Invalid media result.', '媒体结果无效。'],
  'Invalid video result.': ['Invalid video result.', '视频结果无效。'],
  'Opening return exceeds the limit.': [
    'Opening return exceeds the limit.',
    '打开返回结果超过限制。',
  ],
  'Envelope retry does not match.': [
    'Envelope retry does not match.',
    '封装重试不匹配。',
  ],
  'Invalid community revision.': [
    'Invalid community revision.',
    '社区修订版本无效。',
  ],
  'Invalid DM revision.': ['Invalid DM revision.', '私信修订版本无效。'],
  'Invalid status revision.': [
    'Invalid status revision.',
    '状态修订版本无效。',
  ],
  'Invalid group revision.': ['Invalid group revision.', '群组修订版本无效。'],
  'Invalid revision.': ['Invalid revision.', '修订版本无效。'],
  'Sanction unavailable.': ['Sanction unavailable.', '处罚不可用。'],
  'Invalid mutual followers.': [
    'Invalid mutual followers.',
    '共同关注者无效。',
  ],
  'Invalid followers.': ['Invalid followers.', '关注者无效。'],
  'Cleanup selection does not match.': [
    'Cleanup selection does not match.',
    '清理选择不匹配。',
  ],
  'Invalid media selection.': ['Invalid media selection.', '媒体选择无效。'],
  'Invalid session.': ['Invalid session.', '会话无效。'],
  'Invalid status.': ['Invalid status.', '状态无效。'],
  'Invalid streams.': ['Invalid streams.', '数据流无效。'],
  'Invalid suggestions.': ['Invalid suggestions.', '建议无效。'],
  'Part size does not match.': [
    'Part size does not match.',
    '分片大小不匹配。',
  ],
  'Invalid community text.': ['Invalid community text.', '社区文字无效。'],
  'Invalid text.': ['Invalid text.', '文字无效。'],
  'Invalid report type.': ['Invalid report type.', '举报类型无效。'],
  'Invalid media type.': ['Invalid media type.', '媒体类型无效。'],
  'Invalid notification type.': [
    'Invalid notification type.',
    '通知类型无效。',
  ],
  'Invalid declared DM media type.': [
    'Invalid declared DM media type.',
    '声明的私信媒体类型无效。',
  ],
  'Invalid Olm type.': ['Invalid Olm type.', 'Olm 类型无效。'],
  'DM transfer incomplete.': ['DM transfer incomplete.', '私信传输不完整。'],
  'DM transfers unavailable.': [
    'DM transfers unavailable.',
    '私信传输不可用。',
  ],
  'Invalid ICE transport.': ['Invalid ICE transport.', 'ICE 传输无效。'],
  'Invalid individual transport.': [
    'Invalid individual transport.',
    '一对一传输无效。',
  ],
  'Upload incomplete.': ['Upload incomplete.', '上传不完整。'],
  'Invalid recovery version.': ['Invalid recovery version.', '恢复版本无效。'],
  'Invalid version.': ['Invalid version.', '版本无效。'],
  'Recovery binding does not match.': [
    'Recovery binding does not match.',
    '恢复绑定不匹配。',
  ],
  'Invalid Matrix binding.': ['Invalid Matrix binding.', 'Matrix 绑定无效。'],
  'Invalid visibility.': ['Invalid visibility.', '可见性无效。'],
  'Views unavailable.': ['Views unavailable.', '浏览记录不可用。'],
  'Invalid vote.': ['Invalid vote.', '投票无效。'],
  'Invalid approval wallet.': ['Invalid approval wallet.', '批准钱包无效。'],
  'Issuing wallet does not match.': [
    'Issuing wallet does not match.',
    '签发钱包不匹配。',
  ],
  'Opening expired or was interrupted. Start again.': [
    'Opening expired or was interrupted. Start again.',
    '打开流程已过期或中断。请重新开始。',
  ],
  'The mobile environment requires a private network.': [
    'The mobile environment requires a private network.',
    '手机环境需要私有网络。',
  ],
  'The community changed. Reload before continuing.': [
    'The community changed. Reload before continuing.',
    '社区已更改。请刷新后继续。',
  ],
  'The account changed during sign-in. Start again.': [
    'The account changed during sign-in. Start again.',
    '登录期间账户已更改。请重新开始。',
  ],
  'The appeal has already been recorded.': [
    'The appeal has already been recorded.',
    '申诉已记录。',
  ],
  'The description allows up to {0} characters.': [
    'The description allows up to {0} characters.',
    '简介最多允许 {0} 个字符。',
  ],
  'The description allows up to five lines.': [
    'The description allows up to five lines.',
    '简介最多允许五行。',
  ],
  'The description contains invisible characters.': [
    'The description contains invisible characters.',
    '简介含有不可见字符。',
  ],
  'Your follow choice changed. Reload before retrying.': [
    'Your follow choice changed. Reload before retrying.',
    '关注选项已更改。请刷新后重试。',
  ],
  'Posts can only be edited within the first hour.': [
    'Posts can only be edited within the first hour.',
    '帖子只能在发布后一小时内编辑。',
  ],
  'Preparation changed the duration.': [
    'Preparation changed the duration.',
    '处理改变了时长。',
  ],
  'Recovery belongs to another account or origin.': [
    'Recovery belongs to another account or origin.',
    '恢复信息属于另一个账户或来源。',
  ],
  'Review must preserve the global ban on explicit content.': [
    'Review must preserve the global ban on explicit content.',
    '复核必须保留对露骨内容的全局禁止规则。',
  ],
  'The tag changed. Reload before continuing.': [
    'The tag changed. Reload before continuing.',
    '标签已更改。请刷新后继续。',
  ],
  'The wallet has not finished opening the keys.': [
    'The wallet has not finished opening the keys.',
    '钱包尚未完成打开密钥。',
  ],
  'Opening ended or does not match.': [
    'Opening ended or does not match.',
    '打开流程已结束或不匹配。',
  ],
  'Opening unavailable for this browser.': [
    'Opening unavailable for this browser.',
    '此浏览器无法使用打开流程。',
  ],
  'Acceptance belongs to another authorization.': [
    'Acceptance belongs to another authorization.',
    '接受记录属于其他授权。',
  ],
  'Wait for the active transfer to finish.': [
    'Wait for the active transfer to finish.',
    '请等待当前传输完成。',
  ],
  'Change not allowed.': ['Change not allowed.', '不允许此更改。'],
  'Analysis unavailable for this account.': [
    'Analysis unavailable for this account.',
    '此账户无法使用分析。',
  ],
  'Analysis superseded, interrupted or expired.': [
    'Analysis superseded, interrupted or expired.',
    '分析已被替代、中断或过期。',
  ],
  'Attachment not fully preserved.': [
    'Attachment not fully preserved.',
    '附件未完整保留。',
  ],
  'Attachment busy.': ['Attachment busy.', '附件正在使用中。'],
  'Attachment removed from the personal vault.': [
    'Attachment removed from the personal vault.',
    '附件已从个人保险库中移除。',
  ],
  'Recipient device revoked.': [
    'Recipient device revoked.',
    '接收设备授权已撤销。',
  ],
  'Device differs from the code.': [
    'Device differs from the code.',
    '设备与代码不一致。',
  ],
  'Device not authorized for the vault.': [
    'Device not authorized for the vault.',
    '设备未获保险库访问授权。',
  ],
  'Device not authorized.': ['Device not authorized.', '设备未获授权。'],
  'Device repeated in the batch.': [
    'Device repeated in the batch.',
    '批次中设备重复。',
  ],
  'Device has no current authorization.': [
    'Device has no current authorization.',
    '设备缺少当前授权。',
  ],
  'Device has no authorization.': [
    'Device has no authorization.',
    '设备缺少授权。',
  ],
  'Device has no current DM identity.': [
    'Device has no current DM identity.',
    '设备缺少当前私信身份。',
  ],
  'The participant must update DM devices.': [
    'The participant must update DM devices.',
    '成员需要更新私信设备。',
  ],
  'Devices changed during sending. Encrypt again.': [
    'Devices changed during sending. Encrypt again.',
    '发送期间设备已更改。请重新加密。',
  ],
  'Empty file.': ['Empty file.', '文件为空。'],
  'Sign-in signature invalid or expired.': [
    'Sign-in signature invalid or expired.',
    '登录签名无效或已过期。',
  ],
  'Signature belongs to another device.': [
    'Signature belongs to another device.',
    '签名属于另一台设备。',
  ],
  'Refresh the page: call time does not match.': [
    'Refresh the page: call time does not match.',
    '请刷新页面：通话时间不匹配。',
  ],
  'Group audience duplicated or out of order.': [
    'Group audience duplicated or out of order.',
    '群组受众重复或顺序错误。',
  ],
  'Audience changed or was already finalized.': [
    'Audience changed or was already finalized.',
    '受众已更改或已确定。',
  ],
  'Old authority in the vault.': [
    'Old authority in the vault.',
    '保险库中的授权已过时。',
  ],
  'Cleanup authority changed.': [
    'Cleanup authority changed.',
    '清理授权已更改。',
  ],
  'Device authorization changed. Check again.': [
    'Device authorization changed. Check again.',
    '设备授权已更改。请重新核对。',
  ],
  'Authorization requires HTTPS.': [
    'Authorization requires HTTPS.',
    '授权需要 HTTPS。',
  ],
  'Authorization not registered.': [
    'Authorization not registered.',
    '授权未登记。',
  ],
  'Authorization belongs to another device.': [
    'Authorization belongs to another device.',
    '授权属于另一台设备。',
  ],
  'The badge must be one line without invisible control characters.': [
    'The badge must be one line without invisible control characters.',
    '徽章必须为一行，且不含不可见控制字符。',
  ],
  'Badge invalid or too long.': [
    'Badge invalid or too long.',
    '徽章无效或过长。',
  ],
  'Badge changed. Reload.': ['Badge changed. Reload.', '徽章已更改。请刷新。'],
  'Banner changed on another device. Reload before editing.': [
    'Banner changed on another device. Reload before editing.',
    '横幅已在另一台设备上更改。请刷新后再编辑。',
  ],
  'Block not confirmed in this account.': [
    'Block not confirmed in this account.',
    '数据块未在此账户中确认。',
  ],
  'DM block changed. Reload.': [
    'DM block changed. Reload.',
    '私信屏蔽设置已更改。请刷新。',
  ],
  'Channel has no current authorization.': [
    'Channel has no current authorization.',
    '通道缺少当前授权。',
  ],
  'Non-relay candidate rejected.': [
    'Non-relay candidate rejected.',
    '非中继候选项被拒绝。',
  ],
  'Candidate replaced or expired.': [
    'Candidate replaced or expired.',
    '候选内容已被替换或过期。',
  ],
  'Insufficient ranking capacity to publish the full set.': [
    'Insufficient ranking capacity to publish the full set.',
    '排行榜容量不足，无法发布完整集合。',
  ],
  'Insufficient global capacity to publish the ranking.': [
    'Insufficient global capacity to publish the ranking.',
    '全局容量不足，无法发布排行榜。',
  ],
  'Global capacity occupied by stored data or ongoing uploads. Resume later.': [
    'Global capacity occupied by stored data or ongoing uploads. Resume later.',
    '已存数据或正在上传的内容占用了全局容量。请稍后继续。',
  ],
  'Card exceeds the message limit.': [
    'Card exceeds the message limit.',
    '卡片超过消息上限。',
  ],
  'Key belongs to another account or device.': [
    'Key belongs to another account or device.',
    '密钥属于另一个账户或设备。',
  ],
  'Recovery key lacks verified authority.': [
    'Recovery key lacks verified authority.',
    '恢复密钥缺少已验证授权。',
  ],
  'DM session key replaced.': [
    'DM session key replaced.',
    '私信会话密钥已替换。',
  ],
  'One-time key repeated with different content.': [
    'One-time key repeated with different content.',
    '一次性密钥重复，但内容不同。',
  ],
  'Matrix key is not canonical.': [
    'Matrix key is not canonical.',
    'Matrix 密钥格式不规范。',
  ],
  'DM device keys changed.': [
    'DM device keys changed.',
    '私信设备密钥已更改。',
  ],
  'Recipient keys changed. Check again.': [
    'Recipient keys changed. Check again.',
    '接收者密钥已更改。请重新核对。',
  ],
  'Keys outside authorized membership.': [
    'Keys outside authorized membership.',
    '密钥不属于已授权成员范围。',
  ],
  "This device's Matrix keys changed. Authorize a new device identity.": [
    "This device's Matrix keys changed. Authorize a new device identity.",
    '此设备的 Matrix 密钥已更改。请授权新的设备身份。',
  ],
  'Matrix keys differ from the binding.': [
    'Matrix keys differ from the binding.',
    'Matrix 密钥与绑定不一致。',
  ],
  'Matrix ciphertext is not canonical.': [
    'Matrix ciphertext is not canonical.',
    'Matrix 密文格式不规范。',
  ],
  'Code expired or deadline invalid. Create a new request.': [
    'Code expired or deadline invalid. Create a new request.',
    '代码已过期或期限无效。请创建新请求。',
  ],
  'Code expired, cancelled or already used.': [
    'Code expired, cancelled or already used.',
    '代码已过期、取消或已使用。',
  ],
  'Code expired, reused or device does not match.': [
    'Code expired, reused or device does not match.',
    '代码已过期、被重复使用或设备不匹配。',
  ],
  'Code expired. Generate another on the connected device.': [
    'Code expired. Generate another on the connected device.',
    '代码已过期。请在已连接设备上重新生成。',
  ],
  'Code already used or invalid.': [
    'Code already used or invalid.',
    '代码已使用或无效。',
  ],
  'Code already used.': ['Code already used.', '代码已使用。'],
  'Code already used. Create a new request.': [
    'Code already used. Create a new request.',
    '代码已使用。请创建新请求。',
  ],
  'Code belongs to another account.': [
    'Code belongs to another account.',
    '代码属于另一个账户。',
  ],
  'Code belongs to another session.': [
    'Code belongs to another session.',
    '代码属于另一个会话。',
  ],
  'Vault outdated, omitted or inconsistent.': [
    'Vault outdated, omitted or inconsistent.',
    '保险库过时、缺失或不一致。',
  ],
  'Vault full. Preserve or delete content before accepting new data.': [
    'Vault full. Preserve or delete content before accepting new data.',
    '保险库已满。接受新数据前，请保留或删除内容。',
  ],
  'Group vault full in this category.': [
    'Group vault full in this category.',
    '群组保险库的此类别已满。',
  ],
  'Vault changed on another device. Sync while preserving the draft.': [
    'Vault changed on another device. Sync while preserving the draft.',
    '保险库已在另一台设备上更改。请保留草稿并同步。',
  ],
  'Remote vault predates the local checkpoint.': [
    'Remote vault predates the local checkpoint.',
    '远程保险库早于本地检查点。',
  ],
  'Community archived: read only.': [
    'Community archived: read only.',
    '社区已归档：仅可阅读。',
  ],
  'Communities busy. Please wait.': [
    'Communities busy. Please wait.',
    '社区服务繁忙。请稍候。',
  ],
  'Complete or cancel ongoing publications.': [
    'Complete or cancel ongoing publications.',
    '请完成或取消正在进行的发布。',
  ],
  'Complete or cancel ongoing transfers.': [
    'Complete or cancel ongoing transfers.',
    '请完成或取消正在进行的传输。',
  ],
  'Configure devices and recovery before opening the vault.': [
    'Configure devices and recovery before opening the vault.',
    '请先配置设备和恢复功能，再打开保险库。',
  ],
  'Configure recovery on an authorized device first.': [
    'Configure recovery on an authorized device first.',
    '请先在已授权设备上配置恢复功能。',
  ],
  'Explicitly confirm public profile creation.': [
    'Explicitly confirm public profile creation.',
    '请明确确认创建公开个人资料。',
  ],
  'Confirm your wallet in this session before resetting the vault.': [
    'Confirm your wallet in this session before resetting the vault.',
    '重置保险库前，请在此会话中确认钱包。',
  ],
  'Confirm your wallet in this session to perform this action.': [
    'Confirm your wallet in this session to perform this action.',
    '请在此会话中确认钱包以执行此操作。',
  ],
  'Check the full directory.': [
    'Check the full directory.',
    '请查阅完整目录。',
  ],
  'Account unavailable. Try again.': [
    'Account unavailable. Try again.',
    '账户不可用。请重试。',
  ],
  'Account busy. Please wait.': [
    'Account busy. Please wait.',
    '账户服务繁忙。请稍候。',
  ],
  'conta-solana-ausente': ['Solana account missing', '缺少 Solana 账户'],
  'conta-solana-invalida': ['Invalid Solana account', 'Solana 账户无效'],
  'Contact unavailable for this operation.': [
    'Contact unavailable for this operation.',
    '此操作无法使用该联系人。',
  ],
  'Contact has no current consent.': [
    'Contact has no current consent.',
    '联系人缺少当前同意。',
  ],
  'Contacts changed during publication. Check the audience and try again.': [
    'Contacts changed during publication. Check the audience and try again.',
    '发布期间联系人已更改。请核对受众后重试。',
  ],
  'Appeal already sent or removal ended.': [
    'Appeal already sent or removal ended.',
    '申诉已发送或移除流程已结束。',
  ],
  'Appeal already sent or sanction ended.': [
    'Appeal already sent or sanction ended.',
    '申诉已发送或处罚已结束。',
  ],
  'Appeal already reviewed.': ['Appeal already reviewed.', '申诉已复核。'],
  'Appeal superseded, unavailable or expired.': [
    'Appeal superseded, unavailable or expired.',
    '申诉已被替代、不可用或过期。',
  ],
  'Appeal before review, or restore with a reason.': [
    'Appeal before review, or restore with a reason.',
    '请在复核前申诉，或填写原因后恢复。',
  ],
  'Deleted or hidden content does not accept new interactions.': [
    'Deleted or hidden content does not accept new interactions.',
    '已删除或隐藏的内容不接受新的互动。',
  ],
  'A conversation requires two accounts.': [
    'A conversation requires two accounts.',
    '对话需要两个账户。',
  ],
  'Invitation belongs to another site.': [
    'Invitation belongs to another site.',
    '邀请属于其他网站。',
  ],
  'Invitation or transfer ended.': [
    'Invitation or transfer ended.',
    '邀请或转让已结束。',
  ],
  'Group media quota full. Wait for cleanup or export and clear the vault.': [
    'Group media quota full. Wait for cleanup or export and clear the vault.',
    '群组媒体额度已满。请等待清理，或导出并清理保险库。',
  ],
  'Group text/control quota full.': [
    'Group text/control quota full.',
    '群组文字与控制数据额度已满。',
  ],
  'Create your public profile in Profile before participating.': [
    'Create your public profile in Profile before participating.',
    '请先在“个人资料”中创建公开个人资料，再参与。',
  ],
  'Create your public profile in Profile to organize your lists.': [
    'Create your public profile in Profile to organize your lists.',
    '请在“个人资料”中创建公开个人资料以管理列表。',
  ],
  'Cursor is in the future.': ['Cursor is in the future.', '游标指向未来。'],
  'Cursor belongs to another discussion or ordering.': [
    'Cursor belongs to another discussion or ordering.',
    '游标属于其他讨论或排序。',
  ],
  'Cursor belongs to different filters.': [
    'Cursor belongs to different filters.',
    '游标属于其他筛选条件。',
  ],
  'Report already closed.': ['Report already closed.', '举报已结束。'],
  'Challenge expired or belongs to another context.': [
    'Challenge expired or belongs to another context.',
    '验证请求已过期或属于其他上下文。',
  ],
  'Challenge expired. Generate another code.': [
    'Challenge expired. Generate another code.',
    '验证请求已过期。请生成新代码。',
  ],
  'Challenge invalid or expired.': [
    'Challenge invalid or expired.',
    '验证请求无效或已过期。',
  ],
  'Description changed on another device. Reload before editing.': [
    'Description changed on another device. Reload before editing.',
    '简介已在另一台设备上更改。请刷新后编辑。',
  ],
  'Recipient already included in this publication.': [
    'Recipient already included in this publication.',
    '发布已包含此接收者。',
  ],
  'Duplicate recipient.': ['Duplicate recipient.', '接收者重复。'],
  'Recipient suspended.': ['Recipient suspended.', '接收者资格已暂停。'],
  'Enter 2–100 characters to search.': [
    'Enter 2–100 characters to search.',
    '请输入 2–100 个字符以搜索。',
  ],
  'Directory changed on another device. Refresh and confirm again.': [
    'Directory changed on another device. Refresh and confirm again.',
    '目录已在另一台设备上更改。请刷新并重新确认。',
  ],
  'Directory outdated or incomplete.': [
    'Directory outdated or incomplete.',
    '目录已过时或不完整。',
  ],
  'DM directory contains data from another context.': [
    'DM directory contains data from another context.',
    '私信目录包含其他上下文的数据。',
  ],
  'Contact directory changed.': [
    'Contact directory changed.',
    '联系人目录已更改。',
  ],
  'Directory outside authorized history.': [
    'Directory outside authorized history.',
    '目录不属于已授权历史范围。',
  ],
  'Directory includes a device without current authorization.': [
    'Directory includes a device without current authorization.',
    '目录包含缺少当前授权的设备。',
  ],
  'Participant directory or recovery changed. Refresh before resending.': [
    'Participant directory or recovery changed. Refresh before resending.',
    '成员目录或恢复信息已更改。重发前请刷新。',
  ],
  'Directory belongs to another account.': [
    'Directory belongs to another account.',
    '目录属于另一个账户。',
  ],
  'Devices changed. Refresh before saving.': [
    'Devices changed. Refresh before saving.',
    '设备已更改。请刷新后保存。',
  ],
  'DMs accept declared text, photos, GIFs and voice; private profiles and other operations are prohibited.':
    [
      'DMs accept declared text, photos, GIFs and voice; private profiles and other operations are prohibited.',
      '私信仅接受已声明的文字、图片、GIF 和语音；禁止私密个人资料及其他操作。',
    ],
  'DM accepted: use personal cleanup after preserving your backup.': [
    'DM accepted: use personal cleanup after preserving your backup.',
    '私信已接受：请保留备份后使用个人清理。',
  ],
  'A DM requires two people.': [
    'A DM requires two people.',
    '私信需要两个人。',
  ],
  'DMs require independent identity and keys.': [
    'DMs require independent identity and keys.',
    '私信需要独立身份和密钥。',
  ],
  'DM removed from the personal vault.': [
    'DM removed from the personal vault.',
    '私信已从个人保险库中移除。',
  ],
  'DM has no current acceptance or is unavailable.': [
    'DM has no current acceptance or is unavailable.',
    '私信缺少当前接受记录或不可用。',
  ],
  'Private domain not allowed.': [
    'Private domain not allowed.',
    '不允许私有域名。',
  ],
  'Download suspended due to missing consent.': [
    'Download suspended due to missing consent.',
    '下载因缺少同意而暂停。',
  ],
  'End one session before opening another.': [
    'End one session before opening another.',
    '打开新会话前，请结束当前会话。',
  ],
  'A private IPv4 address is required.': [
    'A private IPv4 address is required.',
    '需要私有 IPv4 地址。',
  ],
  'Entry requires document navigation.': [
    'Entry requires document navigation.',
    '入口需要文档导航。',
  ],
  'DM delivery suspended. Renewed consent is required.': [
    'DM delivery suspended. Renewed consent is required.',
    '私信送达已暂停。需要重新同意。',
  ],
  'Delivery suspended. Renewed consent is required.': [
    'Delivery suspended. Renewed consent is required.',
    '送达已暂停。需要重新同意。',
  ],
  'Repeated group envelope does not match.': [
    'Repeated group envelope does not match.',
    '重复群组封装不匹配。',
  ],
  'Envelope belongs to another Olm identity.': [
    'Envelope belongs to another Olm identity.',
    '封装属于其他 Olm 身份。',
  ],
  'Envelope belongs to another device/context.': [
    'Envelope belongs to another device/context.',
    '封装属于其他设备或上下文。',
  ],
  'Envelope requires Olm.': ['Envelope requires Olm.', '封装需要 Olm。'],
  'Envelope requires a device.': [
    'Envelope requires a device.',
    '封装需要设备。',
  ],
  'Repeated envelope does not match.': [
    'Repeated envelope does not match.',
    '重复封装不匹配。',
  ],
  'Send recovery for this session before continuing.': [
    'Send recovery for this session before continuing.',
    '继续前请发送此会话的恢复信息。',
  ],
  'Send accepted: use bilateral deletion.': [
    'Send accepted: use bilateral deletion.',
    '发送已接受：请使用双方删除功能。',
  ],
  'Send already accepted.': ['Send already accepted.', '发送已被接受。'],
  'Recovery epoch changed.': ['Recovery epoch changed.', '恢复周期已更改。'],
  'Choose 1, 7 or 30 days, or a reversible ban.': [
    'Choose 1, 7 or 30 days, or a reversible ban.',
    '请选择 1、7、30 天，或可撤销封禁。',
  ],
  'Choose up to {0} tags.': ['Choose up to {0} tags.', '最多选择 {0} 个标签。'],
  'Choose another profile to report.': [
    'Choose another profile to report.',
    '请选择其他个人资料以举报。',
  ],
  'Attachment write interrupted.': [
    'Attachment write interrupted.',
    '附件写入已中断。',
  ],
  'Write interrupted.': ['Write interrupted.', '写入已中断。'],
  'Group content space full. Remaining capacity is reserved for administration.':
    [
      'Group content space full. Remaining capacity is reserved for administration.',
      '群组内容空间已满。剩余容量保留给管理数据。',
    ],
  'This analysis does not accept appeals.': [
    'This analysis does not accept appeals.',
    '此分析不接受申诉。',
  ],
  'This account requires recovery through the old code or an authorized device.':
    [
      'This account requires recovery through the old code or an authorized device.',
      '此账户需要通过旧代码或已授权设备恢复。',
    ],
  'This appeal has already been decided.': [
    'This appeal has already been decided.',
    '此申诉已作出决定。',
  ],
  'This message reached 64 changes; send a new message.': [
    'This message reached 64 changes; send a new message.',
    '此消息已达到 64 次更改；请发送新消息。',
  ],
  'Post state contains restricted data.': [
    'Post state contains restricted data.',
    '帖子状态包含受限数据。',
  ],
  'This handle is reserved by the app.': [
    'This handle is reserved by the app.',
    '此用户名由应用保留。',
  ],
  'This handle is already in use. Choose another.': [
    'This handle is already in use. Choose another.',
    '此用户名已被使用。请选择其他用户名。',
  ],
  'This badge is in use. Remove assignments before deleting its definition.': [
    'This badge is in use. Remove assignments before deleting its definition.',
    '此徽章正在使用中。请先移除分配记录，再删除定义。',
  ],
  'This request already received a return.': [
    'This request already received a return.',
    '此请求已收到返回结果。',
  ],
  'Feed restricted to your own account.': [
    'Feed restricted to your own account.',
    '动态仅限你自己的账户。',
  ],
  'Handle DM format outside this context.': [
    'Handle DM format outside this context.',
    '用户名私信格式不适用于此上下文。',
  ],
  'Photo unavailable or expired.': [
    'Photo unavailable or expired.',
    '图片不可用或已过期。',
  ],
  'Photo invalid or contains metadata. Prepare it again.': [
    'Photo invalid or contains metadata. Prepare it again.',
    '图片无效或包含元数据。请重新处理。',
  ],
  'Photo not fully preserved.': [
    'Photo not fully preserved.',
    '图片未完整保留。',
  ],
  'Photo replaced or expired.': [
    'Photo replaced or expired.',
    '图片已替换或过期。',
  ],
  'Deleted group still has members.': [
    'Deleted group still has members.',
    '已删除群组仍有成员。',
  ],
  'Group unavailable for this account.': [
    'Group unavailable for this account.',
    '此账户无法访问该群组。',
  ],
  'Group changed. Check again.': [
    'Group changed. Check again.',
    '群组已更改。请重新核对。',
  ],
  'Group lacks verified device authority.': [
    'Group lacks verified device authority.',
    '群组缺少已验证设备授权。',
  ],
  'Four uploads are incomplete. Resume or discard them before creating another.':
    [
      'Four uploads are incomplete. Resume or discard them before creating another.',
      '有四项上传未完成。创建新上传前，请恢复或丢弃现有上传。',
    ],
  'A decision or request is pending. Check the requests inbox.': [
    'A decision or request is pending. Check the requests inbox.',
    '有待处理决定或请求。请检查请求收件箱。',
  ],
  'DM history changed while reading. Resume synchronization.': [
    'DM history changed while reading. Resume synchronization.',
    '读取期间私信历史已更改。请恢复同步。',
  ],
  'History restricted to the author and managers.': [
    'History restricted to the author and managers.',
    '历史仅作者与管理员可见。',
  ],
  'Device identity already registered.': [
    'Device identity already registered.',
    '设备身份已注册。',
  ],
  'Identity or devices changed. Encrypt again.': [
    'Identity or devices changed. Encrypt again.',
    '身份或设备已更改。请重新加密。',
  ],
  'Authorization identifier already used.': [
    'Authorization identifier already used.',
    '授权标识已使用。',
  ],
  'Badge identifier already used.': [
    'Badge identifier already used.',
    '徽章标识已使用。',
  ],
  'Creation identifier already used.': [
    'Creation identifier already used.',
    '创建标识已使用。',
  ],
  'Report identifier already used.': [
    'Report identifier already used.',
    '举报标识已使用。',
  ],
  'DM identifier already used.': [
    'DM identifier already used.',
    '私信标识已使用。',
  ],
  'Message identifier already used.': [
    'Message identifier already used.',
    '消息标识已使用。',
  ],
  'Media identifier already used. Start another upload.': [
    'Media identifier already used. Start another upload.',
    '媒体标识已使用。请发起新上传。',
  ],
  'Organization identifier already used.': [
    'Organization identifier already used.',
    '组织标识已使用。',
  ],
  'Post identifier already used.': [
    'Post identifier already used.',
    '帖子标识已使用。',
  ],
  'Removal identifier already used.': [
    'Removal identifier already used.',
    '移除标识已使用。',
  ],
  'Sanction identifier already used.': [
    'Sanction identifier already used.',
    '处罚标识已使用。',
  ],
  'Tag identifier already used.': [
    'Tag identifier already used.',
    '标签标识已使用。',
  ],
  'Identifier already used by another operation.': [
    'Identifier already used by another operation.',
    '标识已被其他操作使用。',
  ],
  'Enter only the domain, without a page address.': [
    'Enter only the domain, without a page address.',
    '请仅输入域名，不包含页面地址。',
  ],
  'Subscription already linked; remove it from the previous account.': [
    'Subscription already linked; remove it from the previous account.',
    '订阅已关联；请先从原账户移除。',
  ],
  'A community with this name already exists. Choose another.': [
    'A community with this name already exists. Choose another.',
    '已有同名社区。请选择其他名称。',
  ],
  'This profile already has an active sanction.': [
    'This profile already has an active sanction.',
    '此个人资料已有有效处罚。',
  ],
  'This community already has a tag with this name.': [
    'This community already has a tag with this name.',
    '此社区已有同名标签。',
  ],
  'Read receipt requires content received and preserved on this device.': [
    'Read receipt requires content received and preserved on this device.',
    '已读回执需要内容已在此设备上接收并保留。',
  ],
  'Read receipt requires DMs received and preserved on this device.': [
    'Read receipt requires DMs received and preserved on this device.',
    '已读回执需要私信已在此设备上接收并保留。',
  ],
  'Read receipt requires messages received and preserved on this device.': [
    'Read receipt requires messages received and preserved on this device.',
    '已读回执需要消息已在此设备上接收并保留。',
  ],
  'Device registration limit reached.': [
    'Device registration limit reached.',
    '已达到设备注册上限。',
  ],
  'Creation limit: one per minute and ten per hour.': [
    'Creation limit: one per minute and ten per hour.',
    '创建上限：每分钟 1 个，每小时 10 个。',
  ],
  'Temporary connected device limit reached.': [
    'Temporary connected device limit reached.',
    '已达到已连接设备的临时上限。',
  ],
  'Vault cleanup in progress.': [
    'Vault cleanup in progress.',
    '保险库清理正在进行。',
  ],
  'Link lacks verified device authority.': [
    'Link lacks verified device authority.',
    '链接缺少已验证设备授权。',
  ],
  'Duplicate batch.': ['Duplicate batch.', '批次重复。'],
  'Manifest lacks verified authorization.': [
    'Manifest lacks verified authorization.',
    '清单缺少已验证授权。',
  ],
  'Post marker contains restricted badges.': [
    'Post marker contains restricted badges.',
    '帖子标记包含受限徽章。',
  ],
  'Post marker contains restricted data.': [
    'Post marker contains restricted data.',
    '帖子标记包含受限数据。',
  ],
  'Too many mentions in this publication.': [
    'Too many mentions in this publication.',
    '此发布中的提及过多。',
  ],
  'Message deleted or confirmation does not match.': [
    'Message deleted or confirmation does not match.',
    '消息已删除或确认不匹配。',
  ],
  'Message deleted or removed from the personal vault.': [
    'Message deleted or removed from the personal vault.',
    '消息已删除或从个人保险库中移除。',
  ],
  'Message missing or does not match.': [
    'Message missing or does not match.',
    '消息缺失或不匹配。',
  ],
  'Concurrent message differs or was deleted.': [
    'Concurrent message differs or was deleted.',
    '并发消息不一致或已删除。',
  ],
  'DM differs from the cleanup selection.': [
    'DM differs from the cleanup selection.',
    '私信与清理选择不一致。',
  ],
  'DM unavailable in the personal vault.': [
    'DM unavailable in the personal vault.',
    '个人保险库中的私信不可用。',
  ],
  'DM already accepted.': ['DM already accepted.', '私信已被接受。'],
  'Repeated group message does not match.': [
    'Repeated group message does not match.',
    '重复群组消息不匹配。',
  ],
  'Group message lacks verified authority.': [
    'Group message lacks verified authority.',
    '群组消息缺少已验证授权。',
  ],
  'Message belongs to another membership period.': [
    'Message belongs to another membership period.',
    '消息属于其他成员有效期。',
  ],
  'Message outside authorized membership.': [
    'Message outside authorized membership.',
    '消息不在已授权成员范围内。',
  ],
  'Message already accepted or deleted.': [
    'Message already accepted or deleted.',
    '消息已被接受或删除。',
  ],
  'Message already deleted.': ['Message already deleted.', '消息已删除。'],
  'Message does not match the authorized members.': [
    'Message does not match the authorized members.',
    '消息与已授权成员不匹配。',
  ],
  'Original message removed from the personal vault.': [
    'Original message removed from the personal vault.',
    '原始消息已从个人保险库中移除。',
  ],
  'Message removed from the personal vault.': [
    'Message removed from the personal vault.',
    '消息已从个人保险库中移除。',
  ],
  'Repeated message does not match.': [
    'Repeated message does not match.',
    '重复消息不匹配。',
  ],
  'Message lacks verified authority.': [
    'Message lacks verified authority.',
    '消息缺少已验证授权。',
  ],
  'Messages or permissions changed. Sync again.': [
    'Messages or permissions changed. Sync again.',
    '消息或权限已更改。请重新同步。',
  ],
  'Duplicate messages.': ['Duplicate messages.', '消息重复。'],
  'DM media not fully preserved.': [
    'DM media not fully preserved.',
    '私信媒体未完整保留。',
  ],
  'Media unavailable for this post.': [
    'Media unavailable for this post.',
    '此帖子无法使用该媒体。',
  ],
  'Media not fully preserved.': [
    'Media not fully preserved.',
    '媒体未完整保留。',
  ],
  'Media not prepared.': ['Media not prepared.', '媒体未准备好。'],
  'Media busy.': ['Media busy.', '媒体正在使用中。'],
  'Duplicate public media.': ['Duplicate public media.', '公开媒体重复。'],
  'Duplicate media.': ['Duplicate media.', '媒体重复。'],
  'Media has no current analysis.': [
    'Media has no current analysis.',
    '媒体缺少当前有效分析。',
  ],
  'Unapproved media expired. Upload another file.': [
    'Unapproved media expired. Upload another file.',
    '未获批准的媒体已过期。请上传其他文件。',
  ],
  'Media replaced or expired.': [
    'Media replaced or expired.',
    '媒体已替换或过期。',
  ],
  'Media empty or incomplete.': [
    'Media empty or incomplete.',
    '媒体为空或不完整。',
  ],
  'Media linked or being processed.': [
    'Media linked or being processed.',
    '媒体已关联或正在处理。',
  ],
  'Declared and preserved media differ.': [
    'Declared and preserved media differ.',
    '声明的媒体与已保留媒体不一致。',
  ],
  'Migration requires an authorized device.': [
    'Migration requires an authorized device.',
    '迁移需要已授权设备。',
  ],
  'Membership or ownership change not authorized.': [
    'Membership or ownership change not authorized.',
    '成员身份或所有权更改未获授权。',
  ],
  'Too many pending sign-ins. Please wait.': [
    'Too many pending sign-ins. Please wait.',
    '待处理登录过多。请稍候。',
  ],
  'Too many sign-in requests. Please wait.': [
    'Too many sign-in requests. Please wait.',
    '登录请求过多。请稍候。',
  ],
  'Too many return requests. Please wait.': [
    'Too many return requests. Please wait.',
    '返回请求过多。请稍候。',
  ],
  'Too many linking requests. Please wait.': [
    'Too many linking requests. Please wait.',
    '关联请求过多。请稍候。',
  ],
  'Too many requests. Please wait.': [
    'Too many requests. Please wait.',
    '请求过多。请稍候。',
  ],
  'Too many recovery returns. Please wait.': [
    'Too many recovery returns. Please wait.',
    '恢复返回结果过多。请稍候。',
  ],
  'Mute setting changed on another device; refresh.': [
    'Mute setting changed on another device; refresh.',
    '静音设置已在其他设备上更改；请刷新。',
  ],
  'You cannot block your own wallet.': [
    'You cannot block your own wallet.',
    '不能屏蔽自己的钱包。',
  ],
  'Could not confirm DNS now.': [
    'Could not confirm DNS now.',
    '暂时无法确认 DNS。',
  ],
  'Could not prepare media within the limits. Check the file.': [
    'Could not prepare media within the limits. Check the file.',
    '无法在限制内处理媒体。请检查文件。',
  ],
  'The name must be one line.': [
    'The name must be one line.',
    '名称必须为一行。',
  ],
  'Notifications unavailable for this profile.': [
    'Notifications unavailable for this profile.',
    '此个人资料无法使用通知。',
  ],
  'The share changed. Reload.': [
    'The share changed. Reload.',
    '分享已更改。请刷新。',
  ],
  'The owner automatically follows their community.': [
    'The owner automatically follows their community.',
    '所有者会自动关注自己的社区。',
  ],
  'The existing profile must be preserved and encrypted with the new key.': [
    'The existing profile must be preserved and encrypted with the new key.',
    '必须保留现有个人资料，并使用新密钥加密。',
  ],
  'The post changed. Reload before continuing.': [
    'The post changed. Reload before continuing.',
    '帖子已更改。请刷新后继续。',
  ],
  'The owner does not need a moderator role.': [
    'The owner does not need a moderator role.',
    '所有者不需要管理员角色。',
  ],
  'The notification bell changed. Reload.': [
    'The notification bell changed. Reload.',
    '通知设置已更改。请刷新。',
  ],
  'Operation signed by another device.': [
    'Operation signed by another device.',
    '操作由其他设备签署。',
  ],
  'Unknown analysis operation.': [
    'Unknown analysis operation.',
    '未知分析操作。',
  ],
  'Vault operation not found.': [
    'Vault operation not found.',
    '未找到保险库操作。',
  ],
  'Contact operation not found.': [
    'Contact operation not found.',
    '未找到联系人操作。',
  ],
  'Device operation not found.': [
    'Device operation not found.',
    '未找到设备操作。',
  ],
  'Public profile operation not found.': [
    'Public profile operation not found.',
    '未找到公开个人资料操作。',
  ],
  'Operation not found.': ['Operation not found.', '未找到操作。'],
  'Repeated audience page does not match.': [
    'Repeated audience page does not match.',
    '重复受众页面不匹配。',
  ],
  'Page too large.': ['Page too large.', '页面过大。'],
  'Attachment part tampered with or incomplete.': [
    'Attachment part tampered with or incomplete.',
    '附件分片遭到篡改或不完整。',
  ],
  'Media part does not exist.': [
    'Media part does not exist.',
    '媒体分片不存在。',
  ],
  'Part does not exist.': ['Part does not exist.', '分片不存在。'],
  "A group's membership changed. Refresh.": [
    "A group's membership changed. Refresh.",
    '某群组的成员身份已更改。请刷新。',
  ],
  'Group membership changed.': [
    'Group membership changed.',
    '群组成员身份已更改。',
  ],
  'Group membership changed. Refresh before continuing.': [
    'Group membership changed. Refresh before continuing.',
    '群组成员身份已更改。请刷新后继续。',
  ],
  'Membership changed before acceptance. Refresh and encrypt again.': [
    'Membership changed before acceptance. Refresh and encrypt again.',
    '接受前成员身份已更改。请刷新并重新加密。',
  ],
  'Membership changed during upload. Cancel and encrypt again.': [
    'Membership changed during upload. Cancel and encrypt again.',
    '上传期间成员身份已更改。请取消并重新加密。',
  ],
  'Membership duplicated or inconsistent.': [
    'Membership duplicated or inconsistent.',
    '成员身份重复或不一致。',
  ],
  'Participant suspended.': ['Participant suspended.', '成员资格已暂停。'],
  'Duplicate participants.': ['Duplicate participants.', '成员重复。'],
  'Duplicate call request.': ['Duplicate call request.', '通话请求重复。'],
  'Preparation request exceeds the budget.': [
    'Preparation request exceeds the budget.',
    '处理请求超过预算。',
  ],
  'Return request invalid or expired.': [
    'Return request invalid or expired.',
    '返回请求无效或已过期。',
  ],
  'Request requires confirmation in the original browser.': [
    'Request requires confirmation in the original browser.',
    '请求需要在原浏览器中确认。',
  ],
  'Request expired.': ['Request expired.', '请求已过期。'],
  'Request already used or expired.': [
    'Request already used or expired.',
    '请求已使用或过期。',
  ],
  'Request not authorized.': ['Request not authorized.', '请求未获授权。'],
  'Request belongs to another account or deadline.': [
    'Request belongs to another account or deadline.',
    '请求属于其他账户或期限。',
  ],
  'Request belongs to another device or account.': [
    'Request belongs to another device or account.',
    '请求属于其他设备或账户。',
  ],
  'Profile changed in another tab. Refresh before continuing.': [
    'Profile changed in another tab. Refresh before continuing.',
    '个人资料已在其他标签页更改。请刷新后继续。',
  ],
  'Profile changed in another session or session expired. Reload.': [
    'Profile changed in another session or session expired. Reload.',
    '个人资料已在其他会话中更改，或会话已过期。请刷新。',
  ],
  'Profile changed on another device. Reload before editing.': [
    'Profile changed on another device. Reload before editing.',
    '个人资料已在其他设备上更改。请刷新后编辑。',
  ],
  'Profile changed; reload your preferences.': [
    'Profile changed; reload your preferences.',
    '个人资料已更改；请重新加载设置。',
  ],
  'Profile does not match the signed change.': [
    'Profile does not match the signed change.',
    '个人资料与已签名的更改不一致。',
  ],
  'Public profiles busy. Please wait.': [
    'Public profiles busy. Please wait.',
    '公开个人资料服务繁忙。请稍候。',
  ],
  'Permissions changed on another device. Refresh and check before retrying.': [
    'Permissions changed on another device. Refresh and check before retrying.',
    '权限已在其他设备上更改。请刷新并核对后重试。',
  ],
  'Deleted or hidden posts cannot be edited.': [
    'Deleted or hidden posts cannot be edited.',
    '已删除或隐藏的帖子无法编辑。',
  ],
  'Post deleted or removal already ended.': [
    'Post deleted or removal already ended.',
    '帖子已删除或移除流程已结束。',
  ],
  'Post already deleted or hidden.': [
    'Post already deleted or hidden.',
    '帖子已删除或隐藏。',
  ],
  'Posts do not accept a parent.': [
    'Posts do not accept a parent.',
    '帖子不接受父内容。',
  ],
  'Deleted or hidden posts do not accept new interactions.': [
    'Deleted or hidden posts do not accept new interactions.',
    '已删除或隐藏的帖子不接受新的互动。',
  ],
  'Post unavailable for sharing.': [
    'Post unavailable for sharing.',
    '帖子无法分享。',
  ],
  'Post unavailable for this profile.': [
    'Post unavailable for this profile.',
    '此个人资料无法访问该帖子。',
  ],
  'Preference changed on another device; refresh.': [
    'Preference changed on another device; refresh.',
    '设置已在其他设备上更改；请刷新。',
  ],
  'Preference changed. Reload before continuing.': [
    'Preference changed. Reload before continuing.',
    '设置已更改。请刷新后继续。',
  ],
  'Preparation interrupted.': ['Preparation interrupted.', '处理已中断。'],
  'Preparation busy. Resume later.': [
    'Preparation busy. Resume later.',
    '处理服务繁忙。请稍后继续。',
  ],
  'Prepare the photo to remove its metadata.': [
    'Prepare the photo to remove its metadata.',
    '请处理图片以移除元数据。',
  ],
  'Prepare a PNG or JPEG photo.': [
    'Prepare a PNG or JPEG photo.',
    '请处理 PNG 或 JPEG 图片。',
  ],
  'Recoverable preservation not prepared for the current epoch.': [
    'Recoverable preservation not prepared for the current epoch.',
    '当前周期尚未准备可恢复保留信息。',
  ],
  'Media processor not configured.': [
    'Media processor not configured.',
    '媒体处理器未配置。',
  ],
  'Processor unavailable or interrupted. Resume the upload.': [
    'Processor unavailable or interrupted. Resume the upload.',
    '处理器不可用或已中断。请恢复上传。',
  ],
  'Publication differs from the audience or prepared content.': [
    'Publication differs from the audience or prepared content.',
    '发布与受众或已处理内容不一致。',
  ],
  'Publication or device changed.': [
    'Publication or device changed.',
    '发布或设备已更改。',
  ],
  'Push is not configured in this environment yet.': [
    'Push is not configured in this environment yet.',
    '此环境尚未配置推送。',
  ],
  'Ranking updated; reload the list.': [
    'Ranking updated; reload the list.',
    '排行榜已更新；请重新加载列表。',
  ],
  'Ranking being prepared. Try again.': [
    'Ranking being prepared. Try again.',
    '排行榜正在准备中。请重试。',
  ],
  'Ranking uses 24 hours or seven days.': [
    'Ranking uses 24 hours or seven days.',
    '排行榜使用 24 小时或七天时段。',
  ],
  'Duplicate receipts.': ['Duplicate receipts.', '接收凭据重复。'],
  'DM receipt belongs to another sender or content.': [
    'DM receipt belongs to another sender or content.',
    '私信回执属于其他发送者或内容。',
  ],
  'DM recovery outdated.': ['DM recovery outdated.', '私信恢复信息已过时。'],
  'Recovery belongs to another identity.': [
    'Recovery belongs to another identity.',
    '恢复信息属于其他身份。',
  ],
  'Recovery belongs to another membership period.': [
    'Recovery belongs to another membership period.',
    '恢复信息属于其他成员有效期。',
  ],
  'Author and audience recovery not yet preserved.': [
    'Author and audience recovery not yet preserved.',
    '作者和受众的恢复信息尚未保留。',
  ],
  'Recovery requires a new device without reusing a revoked identity.': [
    'Recovery requires a new device without reusing a revoked identity.',
    '恢复需要新设备，不能重复使用已撤销的身份。',
  ],
  'Historical recovery restricted to the owner.': [
    'Historical recovery restricted to the owner.',
    '历史恢复仅限所有者。',
  ],
  'Recovery does not match the audience.': [
    'Recovery does not match the audience.',
    '恢复信息与受众不匹配。',
  ],
  'Reference is not for an attachment message.': [
    'Reference is not for an attachment message.',
    '引用不属于附件消息。',
  ],
  'Duplicate reference.': ['Duplicate reference.', '引用重复。'],
  'DM transfer references changed.': [
    'DM transfer references changed.',
    '私信传输引用已更改。',
  ],
  'Sender belongs to another account or device.': [
    'Sender belongs to another account or device.',
    '发送者属于其他账户或设备。',
  ],
  'Remove the management role before applying a sanction.': [
    'Remove the management role before applying a sanction.',
    '处罚前请先解除管理职务。',
  ],
  'Lift the sanction before appointing a moderator.': [
    'Lift the sanction before appointing a moderator.',
    '任命管理员前请先撤销处罚。',
  ],
  'Reserve this operation before uploading.': [
    'Reserve this operation before uploading.',
    '上传前请为此操作创建预留。',
  ],
  'Replies require a parent.': [
    'Replies require a parent.',
    '回复需要父内容。',
  ],
  'Replies do not accept a title/tag.': [
    'Replies do not accept a title/tag.',
    '回复不接受标题或标签。',
  ],
  'Analysis result belongs to another content item or model.': [
    'Analysis result belongs to another content item or model.',
    '分析结果属于其他内容或模型。',
  ],
  'Resume the next upload part.': [
    'Resume the next upload part.',
    '请继续上传下一分片。',
  ],
  'Return expired, cancelled or does not match. Start again.': [
    'Return expired, cancelled or does not match. Start again.',
    '返回结果已过期、取消或不匹配。请重新开始。',
  ],
  'Return invalid or not yet signed.': [
    'Return invalid or not yet signed.',
    '返回结果无效或尚未签名。',
  ],
  'Return already sent.': ['Return already sent.', '返回结果已发送。'],
  'Return belongs to another browser.': [
    'Return belongs to another browser.',
    '返回结果属于其他浏览器。',
  ],
  'Review an appeal or lift the sanction.': [
    'Review an appeal or lift the sanction.',
    '请复核申诉或撤销处罚。',
  ],
  'Revocation signed by another device.': [
    'Revocation signed by another device.',
    '撤销由其他设备签署。',
  ],
  'Sanction already ended.': ['Sanction already ended.', '处罚已结束。'],
  'Cleanup selection duplicated or out of order.': [
    'Cleanup selection duplicated or out of order.',
    '清理选择重复或顺序错误。',
  ],
  'Service shutting down.': ['Service shutting down.', '服务正在关闭。'],
  'Push service not supported.': [
    'Push service not supported.',
    '不支持此推送服务。',
  ],
  'Session ended or expired.': [
    'Session ended or expired.',
    '会话已结束或过期。',
  ],
  'Session or vault authorization changed. Refresh devices.': [
    'Session or vault authorization changed. Refresh devices.',
    '会话或保险库授权已更改。请刷新设备。',
  ],
  'Your handle has already been created and is fixed.': [
    'Your handle has already been created and is fixed.',
    '你的用户名已创建，无法更改。',
  ],
  'Your vote changed. Reload before continuing.': [
    'Your vote changed. Reload before continuing.',
    '你的投票已更改。请刷新后继续。',
  ],
  'Follow the account before enabling its notification bell.': [
    'Follow the account before enabling its notification bell.',
    '请先关注账户，再启用其通知。',
  ],
  'Group mute changed on another device. Refresh.': [
    'Group mute changed on another device. Refresh.',
    '群组静音设置已在其他设备上更改。请刷新。',
  ],
  'Request changed. Reload.': [
    'Request changed. Reload.',
    '请求已更改。请刷新。',
  ],
  'Request declined. The recipient may start a new request.': [
    'Request declined. The recipient may start a new request.',
    '请求已拒绝。接收者可以发起新请求。',
  ],
  'Only WebRTC audio is allowed.': [
    'Only WebRTC audio is allowed.',
    '仅允许 WebRTC 音频。',
  ],
  'Only the author can appeal this removal.': [
    'Only the author can appeal this removal.',
    '仅作者可以对移除决定申诉。',
  ],
  'Only the author can edit the post.': [
    'Only the author can edit the post.',
    '仅作者可以编辑帖子。',
  ],
  'Only the author can edit text.': [
    'Only the author can edit text.',
    '仅作者可以编辑文字。',
  ],
  'Only the author can delete the post.': [
    'Only the author can delete the post.',
    '仅作者可以删除帖子。',
  ],
  'Only the recipient decides on the request.': [
    'Only the recipient decides on the request.',
    '仅接收者可以决定是否接受请求。',
  ],
  'Only the owner can clear the shared vault.': [
    'Only the owner can clear the shared vault.',
    '仅所有者可以清理共享保险库。',
  ],
  'Only the affected profile can appeal.': [
    'Only the affected profile can appeal.',
    '仅受影响的个人资料可以申诉。',
  ],
  'Status unavailable or expired.': [
    'Status unavailable or expired.',
    '状态不可用或已过期。',
  ],
  'Status lacks source authority.': [
    'Status lacks source authority.',
    '状态缺少来源授权。',
  ],
  'The tag must be one line.': [
    'The tag must be one line.',
    '标签必须为一行。',
  ],
  'Tags require a community.': [
    'Tags require a community.',
    '标签需要关联社区。',
  ],
  'Tag unavailable in this community.': [
    'Tag unavailable in this community.',
    '此社区无法使用该标签。',
  ],
  'Duplicate tag in the post.': [
    'Duplicate tag in the post.',
    '帖子中的标签重复。',
  ],
  'Too many tags in the post.': [
    'Too many tags in the post.',
    '帖子中的标签过多。',
  ],
  'Text with mentions is too long.': [
    'Text with mentions is too long.',
    '含提及的文字过长。',
  ],
  'Community text invalid or too long.': [
    'Community text invalid or too long.',
    '社区文字无效或过长。',
  ],
  'Text or mention count exceeds the limit.': [
    'Text or mention count exceeds the limit.',
    '文字或提及数量超过限制。',
  ],
  timeout: ['Timed out', '已超时'],
  'The title must be one line.': [
    'The title must be one line.',
    '标题必须为一行。',
  ],
  'DM transfer interrupted.': ['DM transfer interrupted.', '私信传输已中断。'],
  'DM transfer busy.': ['DM transfer busy.', '私信传输繁忙。'],
  'Transfer is not for this profile or has already ended.': [
    'Transfer is not for this profile or has already ended.',
    '转让不属于此个人资料或已结束。',
  ],
  'Transfer suspended due to missing consent.': [
    'Transfer suspended due to missing consent.',
    '传输因缺少同意而暂停。',
  ],
  'Transfers in progress. Complete or cancel them before starting more.': [
    'Transfers in progress. Complete or cancel them before starting more.',
    '传输正在进行。请完成或取消现有传输后再开始新的传输。',
  ],
  'Transfers in progress. Resume or cancel them before starting more.': [
    'Transfers in progress. Resume or cancel them before starting more.',
    '传输正在进行。请恢复或取消现有传输后再开始新的传输。',
  ],
  'Transfers busy. Resume later.': [
    'Transfers busy. Resume later.',
    '传输繁忙。请稍后继续。',
  ],
  'DM transport requires an individual context.': [
    'DM transport requires an individual context.',
    '私信传输需要一对一上下文。',
  ],
  'TURN did not provide a relay candidate.': [
    'TURN did not provide a relay candidate.',
    'TURN 未提供中继候选项。',
  ],
  'Upload in progress or discard pending.': [
    'Upload in progress or discard pending.',
    '上传正在进行或丢弃待完成。',
  ],
  'Upload in progress. Please wait.': [
    'Upload in progress. Please wait.',
    '正在上传。请稍候。',
  ],
  'Upload requires a reservation from this account.': [
    'Upload requires a reservation from this account.',
    '上传需要此账户的预留。',
  ],
  'Upload expired. Start another upload.': [
    'Upload expired. Start another upload.',
    '上传已过期。请发起新上传。',
  ],
  'Upload incomplete or does not match.': [
    'Upload incomplete or does not match.',
    '上传不完整或不匹配。',
  ],
  'Upload interrupted.': ['Upload interrupted.', '上传已中断。'],
  'Upload not confirmed.': ['Upload not confirmed.', '上传未确认。'],
  'Temporary uploads busy. Resume later.': [
    'Temporary uploads busy. Resume later.',
    '临时上传繁忙。请稍后继续。',
  ],
  'Use 3–30 unaccented letters, numbers or _.': [
    'Use 3–30 unaccented letters, numbers or _.',
    '请使用 3–30 个不带重音符号的字母、数字或下划线。',
  ],
  'Use up to 20 custom badges per community.': [
    'Use up to 20 custom badges per community.',
    '每个社区最多使用 20 个自定义徽章。',
  ],
  'Use up to 4 photos, 3 GIFs or 1 video.': [
    'Use up to 4 photos, 3 GIFs or 1 video.',
    '最多使用 4 张图片、3 个 GIF 或 1 个视频。',
  ],
  'Use up to three custom badges per person in this community.': [
    'Use up to three custom badges per person in this community.',
    '此社区中每人最多使用三个自定义徽章。',
  ],
  'Use photos, GIFs or voice in this DM.': [
    'Use photos, GIFs or voice in this DM.',
    '此私信请使用图片、GIF 或语音。',
  ],
  'Use photos, GIFs or one video, without mixing.': [
    'Use photos, GIFs or one video, without mixing.',
    '请使用图片、GIF 或一个视频，不要混合使用。',
  ],
  'Use JSON.': ['Use JSON.', '请使用 JSON。'],
  'Use a GIF file.': ['Use a GIF file.', '请使用 GIF 文件。'],
  'Use a new device registration for linking.': [
    'Use a new device registration for linking.',
    '请使用新的设备注册信息进行关联。',
  ],
  'Use a single video or image.': [
    'Use a single video or image.',
    '请使用单个视频或图片。',
  ],
  'Use a prepared PNG, JPEG or WebP photo up to 2,048 px.': [
    'Use a prepared PNG, JPEG or WebP photo up to 2,048 px.',
    '请使用已处理的 PNG、JPEG 或 WebP 图片，最大 2,048 像素。',
  ],
  'Use MP4, MOV or WebM video.': [
    'Use MP4, MOV or WebM video.',
    '请使用 MP4、MOV 或 WebM 视频。',
  ],
  'Domain verification busy. Try again.': [
    'Domain verification busy. Try again.',
    '域名验证繁忙。请重试。',
  ],
  'Confirmed versions or ongoing uploads cannot be discarded.': [
    'Confirmed versions or ongoing uploads cannot be discarded.',
    '已确认版本或正在进行的上传无法丢弃。',
  ],
  'Vault version missing or does not match.': [
    'Vault version missing or does not match.',
    '保险库版本缺失或不匹配。',
  ],
  'Version removed from the personal vault.': [
    'Version removed from the personal vault.',
    '版本已从个人保险库中移除。',
  ],
  'Duplicate versions.': ['Duplicate versions.', '版本重复。'],
  'Linking lacks current wallet confirmation.': [
    'Linking lacks current wallet confirmation.',
    '关联缺少当前钱包确认。',
  ],
  'Domain binding changed.': ['Domain binding changed.', '域名绑定已更改。'],
  'Binding belongs to another device.': [
    'Binding belongs to another device.',
    '绑定属于其他设备。',
  ],
  'Matrix binding belongs to another DM.': [
    'Matrix binding belongs to another DM.',
    'Matrix 绑定属于另一条私信。',
  ],
  'Matrix binding lacks verified authority.': [
    'Matrix binding lacks verified authority.',
    'Matrix 绑定缺少已验证授权。',
  ],
  'You are suspended in this community. Check the reason and appeal.': [
    'You are suspended in this community. Check the reason and appeal.',
    '你在此社区中的资格已暂停。请查看原因并申诉。',
  ],
  'You are already the owner.': [
    'You are already the owner.',
    '你已是所有者。',
  ],
  'You are already on your own profile.': [
    'You are already on your own profile.',
    '你已在自己的个人资料页面。',
  ],
  'You already have an open report in this community. Track its review.': [
    'You already have an open report in this community. Track its review.',
    '你在此社区已有正在处理的举报。请查看审核进度。',
  ],
  'You do not have permission to manage this.': [
    'You do not have permission to manage this.',
    '你没有此管理权限。',
  ],
  'Invalid wallet. Check the full EVM or Solana address.': [
    'Invalid wallet. Check the full EVM or Solana address.',
    '钱包无效。请核对完整 EVM 或 Solana 地址。',
  ],
  posted: ['posted', '发布了'],
  replied: ['replied', '回复了'],
  sent: ['sent', '已发送'],
  received: ['received', '已收到'],
  follower: ['follower', '位关注者'],
  followers: ['followers', '位关注者'],
  reply: ['reply', '回复'],
  replies: ['replies', '回复'],
  'setting up': ['setting up', '设置'],
  recovering: ['recovering', '恢复'],
  'Conversa favorita': ['Favorite conversation', '收藏对话'],
  'Preferências da conversa': ['Conversation preferences', '对话设置'],
  'Privacidade dos próximos status': [
    'Privacy for future statuses',
    '后续状态的隐私设置',
  ],
  'Recuperação das DMs pelo @': ['Handle DM recovery', '用户名私信恢复信息'],
  'Identidade para mensagens': ['Messaging identity', '消息身份'],
  'Chamadas perdidas': ['Missed calls', '未接来电'],
  'Language preferences are still syncing.': [
    'Language preferences are still syncing.',
    '语言设置仍在同步中。',
  ],
  'Too many language preference versions.': [
    'Too many language preference versions.',
    '语言设置版本过多。',
  ],
  'community.sort-most-discussed': ['Most discussed', '最多讨论'],
  Oldest: ['Oldest', '最早'],
  'New media publication.': ['New media publication.', '新的媒体发布。'],
  'Not authorized.': ['Not authorized.', '未获授权。'],
  'Invalid device directory.': ['Invalid device directory.', '设备目录无效。'],
  'Invalid device signature.': ['Invalid device signature.', '设备签名无效。'],
  'A revoked identifier cannot be reactivated.': [
    'A revoked identifier cannot be reactivated.',
    '已撤销的标识无法重新启用。',
  ],
  'Invalid recovery migration.': [
    'Invalid recovery migration.',
    '恢复迁移无效。',
  ],
  'Directory exceeds the metadata budget.': [
    'Directory exceeds the metadata budget.',
    '目录超过元数据预算。',
  ],
  'Directory conflict or outdated version.': [
    'Directory conflict or outdated version.',
    '目录冲突或版本过时。',
  ],
  'Device unauthorized or revoked.': [
    'Device unauthorized or revoked.',
    '设备未获授权或授权已撤销。',
  ],
  'Device keys changed.': ['Device keys changed.', '设备密钥已更改。'],
  'Artistic nudity in paintings is allowed. Explicit sexual acts are prohibited, including painted, drawn or AI-generated depictions. Outside the exception for paintings, exposed genitals and female breasts are prohibited. Bikinis and short clothing are allowed. Local rules cannot relax this policy.':
    [
      'Artistic nudity in paintings is allowed. Explicit sexual acts are prohibited, including painted, drawn or AI-generated depictions. Outside the exception for paintings, exposed genitals and female breasts are prohibited. Bikinis and short clothing are allowed. Local rules cannot relax this policy.',
      '绘画中的艺术性裸体允许。露骨的性行为内容一律禁止，包括绘画、手绘或人工智能生成的内容。除绘画的例外外，禁止展示外露的生殖器和女性乳房。比基尼和短款服装允许。本地规则不得放宽该政策。',
    ],
  Test: ['Test', '测试'],
  Private: ['Private', '私密'],
  Groups: ['Groups', '群组'],
  Favorites: ['Favorites', '收藏'],
  'Fav.': ['Fav.', '收藏'],
  'Conversation alongside': ['Conversation alongside', '旁边显示对话'],
  Copy: ['Copy', '复制'],
  Mine: ['Mine', '我的'],
  CONVERSATIONS: ['CONVERSATIONS', '对话'],
  ACCOUNT: ['ACCOUNT', '账户'],
  'Update now': ['Update now', '立即更新'],
  'Search chats, contacts and messages': [
    'Search chats, contacts and messages',
    '搜索聊天、联系人和消息',
  ],
  'Add contact or create group': [
    'Add contact or create group',
    '添加联系人或创建群组',
  ],
  'Contact statuses': ['Contact statuses', '联系人动态'],
  'Filter conversations': ['Filter conversations', '筛选对话'],
  'Communities alongside': ['Communities alongside', '旁边显示社区'],
  'Choose a community to post in': [
    'Choose a community to post in',
    '选择要发布的社区',
  ],
  '0xDMme / TEST': ['0xDMme / TEST', '0xDMme / 测试'],
  'Cancel test': ['Cancel test', '取消测试'],
  'Return to 0xDMme': ['Return to 0xDMme', '返回 0xDMme'],
  'Checking destination and validity…': [
    'Checking destination and validity…',
    '正在检查目标和有效性…',
  ],
  'Check and authorize': ['Check and authorize', '检查并授权'],
  'Starting client…': ['Starting client…', '正在启动客户端…'],
  'Received messages': ['Received messages', '收到的消息'],
  'View packets received by the server': [
    'View packets received by the server',
    '查看服务器收到的数据包',
  ],
  'To use separate tabs:': ['To use separate tabs:', '使用不同的标签页：'],
  'Other tests:': ['Other tests:', '其他测试：'],
  'Alice client': ['Alice client', 'Alice 客户端'],
  'Bob client': ['Bob client', 'Bob 客户端'],
  'Create encrypted vault': ['Create encrypted vault', '创建加密保险库'],
  'Encrypted envelope': ['Encrypted envelope', '加密封装'],
  'Create test — sign twice': [
    'Create test — sign twice',
    '创建测试：签名两次',
  ],
  'Download encrypted package': ['Download encrypted package', '下载加密包'],
  'Delete test only': ['Delete test only', '仅删除测试'],
  'Test this package': ['Test this package', '测试此包'],
  '0xDMme · ZK test': ['0xDMme · ZK test', '0xDMme · ZK 测试'],
  'Isolated ZK proof': ['Isolated ZK proof', '独立 ZK 证明'],
  'Generate and verify ZK proof': [
    'Generate and verify ZK proof',
    '生成并验证 ZK 证明',
  ],
  Light: ['Light', '浅色'],
  and: ['and', '与'],
  'D1 · input={0} · arrival={1} · navigation={2} · history={3} · stage={4} · provider={5} · storage={6} · failure={7} · protocol=doc-3':
    [
      'D1 · input={0} · arrival={1} · navigation={2} · history={3} · stage={4} · provider={5} · storage={6} · failure={7} · protocol=doc-3',
      'D1 · 输入={0} · 到达={1} · 导航={2} · 历史={3} · 阶段={4} · 钱包提供方={5} · 存储={6} · 故障={7} · 协议=doc-3',
    ],
  'D2 · protocol=doc-3 · platform={0} · {1} · ref={2}': [
    'D2 · protocol=doc-3 · platform={0} · {1} · ref={2}',
    'D2 · 协议=doc-3 · 平台={0} · {1} · ref={2}',
  ],
  'D2 · protocol=doc-3 · platform={0} · destination=invalid': [
    'D2 · protocol=doc-3 · platform={0} · destination=invalid',
    'D2 · 协议=doc-3 · 平台={0} · 目标=无效',
  ],
  'destination=path-entry · mode=document · request=present · network={0}': [
    'destination=path-entry · mode=document · request=present · network={0}',
    '目标=路径入口 · 模式=文档 · 请求=存在 · 网络={0}',
  ],
  'destination={0} · mode={1} · request={2} · network={3}': [
    'destination={0} · mode={1} · request={2} · network={3}',
    '目标={0} · 模式={1} · 请求={2} · 网络={3}',
  ],
  'Matrix sources · 0xDMme': [
    'Matrix sources · 0xDMme',
    'Matrix 源代码 · 0xDMme',
  ],
  'Matrix source code and licenses': [
    'Matrix source code and licenses',
    'Matrix 源代码和许可证',
  ],
  'Download the parts in the order below and concatenate them into one file:': [
    'Download the parts in the order below and concatenate them into one file:',
    '按以下顺序下载各部分，并合并为一个文件：',
  ],
  'Before rebuilding the frontend, put the file in this directory:': [
    'Before rebuilding the frontend, put the file in this directory:',
    '重新构建前端之前，请将文件放在此目录：',
  ],
  'The archive includes the official tag, Cargo.lock, the 323 pinned registry source packages and their notices. Full instructions are in the main source package README.':
    [
      'The archive includes the official tag, Cargo.lock, the 323 pinned registry source packages and their notices. Full instructions are in the main source package README.',
      '存档包含官方标签、Cargo.lock、323 个已固定版本的注册表源码包及其声明。完整说明见主要源码包的 README。',
    ],
  '0xDMme — restricted evaluation': [
    '0xDMme — restricted evaluation',
    '0xDMme：受限评估',
  ],
  'RESTRICTED EXPERIMENTAL EVALUATION': [
    'RESTRICTED EXPERIMENTAL EVALUATION',
    '受限实验评估',
  ],
  'Test your artwork': ['Test your artwork', '测试你的作品'],
  'The Viddexa Nano candidate analyzes the image on the VPS and shows its five classes, using ONNX Runtime 1.24.4 on CPU. It is not yet the accepted protection for 0xDMme.':
    [
      'The Viddexa Nano candidate analyzes the image on the VPS and shows its five classes, using ONNX Runtime 1.24.4 on CPU. It is not yet the accepted protection for 0xDMme.',
      '候选模型 Viddexa Nano 使用 CPU 上的 ONNX Runtime 1.24.4 在 VPS 分析图片，并显示其五个类别。它尚未被接受为 0xDMme 的保护机制。',
    ],
  "Policy allows artistic nudity in paintings; explicit sexual acts remain prohibited. The model's":
    [
      "Policy allows artistic nudity in paintings; explicit sexual acts remain prohibited. The model's",
      '政策允许绘画中的艺术裸露；露骨性行为仍被禁止。模型的',
    ],
  'class does not decide this distinction.': [
    'class does not decide this distinction.',
    '类别不能决定这一区别。',
  ],
  'Still image (PNG, JPEG or WebP, up to 8 MiB)': [
    'Still image (PNG, JPEG or WebP, up to 8 MiB)',
    '静态图片（PNG、JPEG 或 WebP，最大 8 MiB）',
  ],
  'What result do you expect under the policy?': [
    'What result do you expect under the policy?',
    '根据政策，你预期的结果是什么？',
  ],
  'Choose your assessment of this image': [
    'Choose your assessment of this image',
    '选择你对此图片的判断',
  ],
  'The image, scores and your reference remain together in this temporary round, only in VPS memory. Your reference does not influence the model. There is no training or automatic sending to external services.':
    [
      'The image, scores and your reference remain together in this temporary round, only in VPS memory. Your reference does not influence the model. There is no training or automatic sending to external services.',
      '图片、评分和你的参考判断一起保留在本次临时评估中，仅存于 VPS 内存。你的判断不会影响模型。不会训练模型或自动发送到外部服务。',
    ],
  'Local preview of the selected image': [
    'Local preview of the selected image',
    '所选图片的本地预览',
  ],
  'Analyze on the VPS': ['Analyze on the VPS', '在 VPS 分析'],
  'Calibration round': ['Calibration round', '校准批次'],
  'Cases remain while this environment is active, for up to 24 hours. Restarting the process loses the round. Reopen the private address to retrieve cases. When finished, export if needed and delete the round. Up to 256 cases or 512 MiB; originals preserved without recompression.':
    [
      'Cases remain while this environment is active, for up to 24 hours. Restarting the process loses the round. Reopen the private address to retrieve cases. When finished, export if needed and delete the round. Up to 256 cases or 512 MiB; originals preserved without recompression.',
      '案例在此环境运行期间保留，最长 24 小时。重启进程会丢失本批次。重新打开私有地址可恢复案例。完成后，按需导出并删除批次。最多 256 个案例或 512 MiB；原件保留，不重新压缩。',
    ],
  'Refresh gallery': ['Refresh gallery', '刷新图库'],
  'Export images + results': ['Export images + results', '导出图片和结果'],
  'Delete this round': ['Delete this round', '删除本批次'],
  'Corresponding interface source code (GPL-3.0-only)': [
    'Corresponding interface source code (GPL-3.0-only)',
    '界面的对应源代码（GPL-3.0-only）',
  ],
  '0xDMme — calibration collection': [
    '0xDMme — calibration collection',
    '0xDMme：校准收集',
  ],
  '0xDMme · PRIVATE GALLERY': ['0xDMme · PRIVATE GALLERY', '0xDMme · 私有图库'],
  'You label. I calibrate.': ['You label. I calibrate.', '你标注，我校准。'],
  'Select your images together and mark only whether they should pass or be blocked. When finished, complete the submission.':
    [
      'Select your images together and mark only whether they should pass or be blocked. When finished, complete the submission.',
      '一次选择你的图片，仅标注应通过还是被屏蔽。完成后提交。',
    ],
  'Select images': ['Select images', '选择图片'],
  'PNG, JPEG or WebP · up to 8 MiB per image. You can add more images later.': [
    'PNG, JPEG or WebP · up to 8 MiB per image. You can add more images later.',
    'PNG、JPEG 或 WebP · 每张最大 8 MiB。之后可以继续添加图片。',
  ],
  'Opening your round…': ['Opening your round…', '正在打开你的批次…'],
  'Select images to begin.': ['Select images to begin.', '选择图片以开始。'],
  'Image to label': ['Image to label', '待标注图片'],
  'Remove file from queue': ['Remove file from queue', '从队列移除文件'],
  'Return to queue': ['Return to queue', '返回队列'],
  'Complete submission': ['Complete submission', '完成提交'],
  'Saved images and corrections': [
    'Saved images and corrections',
    '已保存图片与更正',
  ],
  "Originals are preserved in this local process's memory for up to 24 hours, without training or external analysis. Labels do not feed the detector. Saved images survive tab reloads; the unlabelled queue must be selected again. Keep the Mac on and awake during calibration.":
    [
      "Originals are preserved in this local process's memory for up to 24 hours, without training or external analysis. Labels do not feed the detector. Saved images survive tab reloads; the unlabelled queue must be selected again. Keep the Mac on and awake during calibration.",
      '原件保留在此本地进程的内存中，最长 24 小时，不用于训练或外部分析。标注不会输入检测器。已保存的图片在刷新标签页后仍保留；未标注的队列需要重新选择。校准期间请让 Mac 保持开机且不进入睡眠。',
    ],
  'Corresponding source code for this interface (GPL-3.0-only)': [
    'Corresponding source code for this interface (GPL-3.0-only)',
    '此界面的对应源代码（GPL-3.0-only）',
  ],
  '0xDMme — restricted review': [
    '0xDMme — restricted review',
    '0xDMme：受限复核',
  ],
  'Exceptional review': ['Exceptional review', '例外复核'],
  'Image candidate': ['Image candidate', '待审核图片'],
  'Inspect the complete media. Artistic nudity in paintings is allowed, including digital/AI paintings that are genuinely paintings. Explicit sexual acts remain prohibited. Photos and drawings outside this exception do not allow exposed genitals or female breasts. Decide using the restricted command after reviewing the appeal.':
    [
      'Inspect the complete media. Artistic nudity in paintings is allowed, including digital/AI paintings that are genuinely paintings. Explicit sexual acts remain prohibited. Photos and drawings outside this exception do not allow exposed genitals or female breasts. Decide using the restricted command after reviewing the appeal.',
      '请检查完整媒体。绘画中的艺术裸露是允许的，包括确实属于绘画的数字或 AI 绘画。露骨性行为仍被禁止。不属于此例外的照片和绘图不允许暴露生殖器或女性乳房。核对申诉后，通过受限命令作出决定。',
    ],
  'The preview closes within five minutes.': [
    'The preview closes within five minutes.',
    '预览将在五分钟内关闭。',
  ],
  'Invalid signed statement version.': [
    'Invalid signed statement version.',
    '签名声明版本无效。',
  ],
  'The wallet login document is in English. It connects the browser that opened this request to 0xDMme. Reject links from other people. It does not move funds, authorize transactions or open your encrypted history. Check the domain and address before signing.':
    [
      'The wallet login document is in English. It connects the browser that opened this request to 0xDMme. Reject links from other people. It does not move funds, authorize transactions or open your encrypted history. Check the domain and address before signing.',
      '钱包中的登录文件使用英语。它会将发起此请求的浏览器连接到 0xDMme。请拒绝他人发来的链接。它不会转移资金、授权交易或打开你的加密历史记录。签名前请核对域名和地址。',
    ],
  'The wallet login document is in English. It only connects your account to 0xDMme. It does not move funds, authorize transactions or open your encrypted history. Check the domain and address before signing.':
    [
      'The wallet login document is in English. It only connects your account to 0xDMme. It does not move funds, authorize transactions or open your encrypted history. Check the domain and address before signing.',
      '钱包中的登录文件使用英语。它只会将你的账户连接到 0xDMme。它不会转移资金、授权交易或打开你的加密历史记录。签名前请核对域名和地址。',
    ],
  'View reply': ['View reply', '查看回复'],
  group: ['group', '群组'],
  'Write a reply': ['Write a reply', '撰写回复'],
  'Reply unavailable.': ['Reply unavailable.', '回复不可用。'],
  'Could not update the count.': [
    'Could not update the count.',
    '无法更新计数。',
  ],
  'Delete for everyone': ['Delete for everyone', '为所有人删除'],
  'Edit message': ['Edit message', '编辑消息'],
  'Save change': ['Save change', '保存更改'],
  'Verify deletions before searching.': [
    'Verify deletions before searching.',
    '搜索前请先核验删除记录。',
  ],
  'Only your own synced text messages can be edited.': [
    'Only your own synced text messages can be edited.',
    '只能编辑你自己已同步的文本消息。',
  ],
  'Only your own synced messages can be deleted.': [
    'Only your own synced messages can be deleted.',
    '只能删除你自己已同步的消息。',
  ],
  'Verify deletions before opening media.': [
    'Verify deletions before opening media.',
    '打开媒体前请先核验删除记录。',
  ],
  'The message was deleted or is unavailable for opening media.': [
    'The message was deleted or is unavailable for opening media.',
    '消息已删除或无法用于打开媒体。',
  ],
  'Group index partially verified. Continue syncing.': [
    'Group index partially verified. Continue syncing.',
    '群组索引已部分核验。请继续同步。',
  ],
  'Group change set mismatch.': [
    'Group change set mismatch.',
    '群组变更集不匹配。',
  ],
  'Snapshot belongs to another group or authorization context.': [
    'Snapshot belongs to another group or authorization context.',
    '快照属于其他群组或授权上下文。',
  ],
  'Invalid group index.': ['Invalid group index.', '群组索引无效。'],
  'Message is outside your current group participation.': [
    'Message is outside your current group participation.',
    '消息不属于你当前的群组参与范围。',
  ],
  'Duplicate group index.': ['Duplicate group index.', '群组索引重复。'],
  'Group order mismatch.': ['Group order mismatch.', '群组顺序不匹配。'],
  'Incomplete group index.': ['Incomplete group index.', '群组索引不完整。'],
  'Group change set limit exceeded.': [
    'Group change set limit exceeded.',
    '群组变更集超出限制。',
  ],
  'Cursor belongs to another revision.': [
    'Cursor belongs to another revision.',
    '游标属于其他修订版本。',
  ],
  'Edit does not match the original group message.': [
    'Edit does not match the original group message.',
    '编辑与原始群组消息不匹配。',
  ],
  'Outdated group state.': ['Outdated group state.', '群组状态已过期。'],
  'Group preparation timed out; try again.': [
    'Group preparation timed out; try again.',
    '群组准备超时，请重试。',
  ],
  'Incomplete group objects.': [
    'Incomplete group objects.',
    '群组对象不完整。',
  ],
  'Objects belong to another query.': [
    'Objects belong to another query.',
    '对象属于其他查询。',
  ],
  'Invalid group edits.': ['Invalid group edits.', '群组编辑无效。'],
  'Deletion does not match the verified group message.': [
    'Deletion does not match the verified group message.',
    '删除记录与已核验的群组消息不匹配。',
  ],
  'Receiving was interrupted while suspended.': [
    'Receiving was interrupted while suspended.',
    '暂停期间接收已中断。',
  ],
  'Changes belong to another snapshot.': [
    'Changes belong to another snapshot.',
    '变更属于其他快照。',
  ],
  'Incomplete or duplicate changes.': [
    'Incomplete or duplicate changes.',
    '变更不完整或重复。',
  ],
  'Could not verify read receipts.': [
    'Could not verify read receipts.',
    '无法核验已读回执。',
  ],
  'Deletion authorization has changed.': [
    'Deletion authorization has changed.',
    '删除权限已变更。',
  ],
  'Only the author who is a group participant can delete their message.': [
    'Only the author who is a group participant can delete their message.',
    '只有仍是群组成员的作者才能删除自己的消息。',
  ],
  'Group messages have changed. Verify them again.': [
    'Group messages have changed. Verify them again.',
    '群组消息已变更。请重新核验。',
  ],
  'This message has reached 64 edits.': [
    'This message has reached 64 edits.',
    '此消息已达到 64 次编辑。',
  ],
  'Edit is outside your authorized message.': [
    'Edit is outside your authorized message.',
    '编辑超出你自己获授权消息的范围。',
  ],
  'Incomplete change index.': ['Incomplete change index.', '变更索引不完整。'],
  'Missing deletion proof.': ['Missing deletion proof.', '缺少删除证明。'],
  'Invalid group deletion.': ['Invalid group deletion.', '群组删除无效。'],
  'Deletion belongs to another message, group or author.': [
    'Deletion belongs to another message, group or author.',
    '删除记录属于其他消息、群组或作者。',
  ],
  'Deletion has no authorized device.': [
    'Deletion has no authorized device.',
    '删除操作没有获授权的设备。',
  ],
  'Invalid group action.': ['Invalid group action.', '群组操作无效。'],
  'Only text can be used to edit a message.': [
    'Only text can be used to edit a message.',
    '只能使用文本编辑消息。',
  ],
  'Vault changed during the call.': [
    'Vault changed during the call.',
    '通话期间保险库已更改。',
  ],
  'Online call authorization unavailable.': [
    'Online call authorization unavailable.',
    '在线通话授权不可用。',
  ],
  'Call authorization expired.': [
    'Call authorization expired.',
    '通话授权已过期。',
  ],
  'Media is not ready yet. Resume the upload.': [
    'Media is not ready yet. Resume the upload.',
    '媒体尚未准备好。请继续上传。',
  ],
  'Could not save. Reopen the private link and try again.': [
    'Could not save. Reopen the private link and try again.',
    '无法保存。请重新打开私密链接并重试。',
  ],
  "The operation failed. Check the image or the environment's availability.": [
    "The operation failed. Check the image or the environment's availability.",
    '操作失败。请检查图片或环境是否可用。',
  ],
  'Identities are not synchronized yet.': [
    'Identities are not synchronized yet.',
    '身份尚未同步。',
  ],
  'Community unavailable. Try again.': [
    'Community unavailable. Try again.',
    '社区不可用。请重试。',
  ],
  'Preparation unavailable. Resume the upload.': [
    'Preparation unavailable. Resume the upload.',
    '准备功能不可用。请继续上传。',
  ],
  'GIF must be at most 20 seconds long.': [
    'GIF must be at most 20 seconds long.',
    'GIF 时长不得超过 20 秒。',
  ],
  'Community owner': ['Community owner', '社区所有者'],
  'New member': ['New member', '新成员'],
  'Invalid object.': ['Invalid object.', '对象无效。'],
  'Public profile unavailable. Try again.': [
    'Public profile unavailable. Try again.',
    '公开资料不可用。请重试。',
  ],
  'Invalid attachment content.': [
    'Invalid attachment content.',
    '附件内容无效。',
  ],
  'Image format not allowed.': [
    'Image format not allowed.',
    '不支持此图片格式。',
  ],
  'Invalid voice descriptor.': [
    'Invalid voice descriptor.',
    '语音描述信息无效。',
  ],
  'Invalid selection type.': ['Invalid selection type.', '选择类型无效。'],
  'Cleanup requires one to eight items per batch.': [
    'Cleanup requires one to eight items per batch.',
    '每批清理必须包含一到八项。',
  ],
  'Duplicate selection.': ['Duplicate selection.', '选择重复。'],
  'Personal cleanup is not authenticated.': [
    'Personal cleanup is not authenticated.',
    '个人清理未通过身份验证。',
  ],
  'Invalid call invitation.': ['Invalid call invitation.', '通话邀请无效。'],
  'Invalid call capability.': [
    'Invalid call capability.',
    '通话权限凭证无效。',
  ],
  'Use a 0xDMme invitation link from this origin.': [
    'Use a 0xDMme invitation link from this origin.',
    '请使用来自此站点的 0xDMme 邀请链接。',
  ],
  'Invalid invitation.': ['Invalid invitation.', '邀请无效。'],
  'Invalid private contact.': ['Invalid private contact.', '私密联系人无效。'],
  'Field not allowed.': ['Field not allowed.', '不允许此字段。'],
  'Write up to 16 KB of text.': [
    'Write up to 16 KB of text.',
    '请输入不超过 16 KB 的文本。',
  ],
  'Invalid daily content.': ['Invalid daily content.', '日常内容无效。'],
  'Invalid linking code.': ['Invalid linking code.', '关联码无效。'],
  'Linking requires HTTPS.': ['Linking requires HTTPS.', '关联需要 HTTPS。'],
  'Linking code exceeds the limit.': [
    'Linking code exceeds the limit.',
    '关联码超出限制。',
  ],
  'Invalid linking link.': ['Invalid linking link.', '关联链接无效。'],
  'Invalid linking secret.': ['Invalid linking secret.', '关联密钥无效。'],
  'The request does not match the shared code.': [
    'The request does not match the shared code.',
    '请求与共享的关联码不匹配。',
  ],
  'GIF is incomplete, invalid or exceeds the processing budget.': [
    'GIF is incomplete, invalid or exceeds the processing budget.',
    'GIF 不完整、无效或超出处理预算。',
  ],
  'Invalid group name.': ['Invalid group name.', '群组名称无效。'],
  'Invalid group photo.': ['Invalid group photo.', '群组照片无效。'],
  'Group photo must be resized and have no metadata.': [
    'Group photo must be resized and have no metadata.',
    '群组照片必须缩小并移除元数据。',
  ],
  "Image exceeds this device's pixel budget.": [
    "Image exceeds this device's pixel budget.",
    '图片超出此设备的像素预算。',
  ],
  'Use a PNG, JPEG or WebP photo. Other formats can be sent as a file.': [
    'Use a PNG, JPEG or WebP photo. Other formats can be sent as a file.',
    '请使用 PNG、JPEG 或 WebP 照片。其他格式可以作为文件发送。',
  ],
  'Invalid PNG.': ['Invalid PNG.', 'PNG 无效。'],
  'An animated image is not a photo.': [
    'An animated image is not a photo.',
    '动态图不是照片。',
  ],
  'Invalid JPEG.': ['Invalid JPEG.', 'JPEG 无效。'],
  'JPEG dimensions missing.': ['JPEG dimensions missing.', '缺少 JPEG 尺寸。'],
  'Invalid WebP.': ['Invalid WebP.', 'WebP 无效。'],
  'Invalid result.': ['Invalid result.', '结果无效。'],
  'Invalid coverage.': ['Invalid coverage.', '覆盖范围无效。'],
  'Invalid scores.': ['Invalid scores.', '评分无效。'],
  'Invalid distribution.': ['Invalid distribution.', '分布无效。'],
  'Invalid identification.': ['Invalid identification.', '标识无效。'],
  'Invalid budget.': ['Invalid budget.', '预算无效。'],
  'Choose your assessment for this image.': [
    'Choose your assessment for this image.',
    '请选择对此图片的评估。',
  ],
  'Invalid format.': ['Invalid format.', '格式无效。'],
  'Invalid accounting.': ['Invalid accounting.', '计量数据无效。'],
  'Photo is not prepared.': ['Photo is not prepared.', '照片尚未准备好。'],
  'Invalid key/signature.': ['Invalid key/signature.', '密钥或签名无效。'],
  'Voice message has no authenticated descriptor.': [
    'Voice message has no authenticated descriptor.',
    '语音消息缺少已验证的描述信息。',
  ],
  'Invalid DM image.': ['Invalid DM image.', '私信图片无效。'],
  'Invalid DM GIF.': ['Invalid DM GIF.', '私信 GIF 无效。'],
  'Invalid DM photo.': ['Invalid DM photo.', '私信照片无效。'],
  'Media size mismatch.': ['Media size mismatch.', '媒体大小不匹配。'],
  'Invalid voice message.': ['Invalid voice message.', '语音消息无效。'],
  'Invalid received photo.': ['Invalid received photo.', '收到的照片无效。'],
  'Non-canonical encoding.': ['Non-canonical encoding.', '编码不符合规范。'],
  'Invalid size.': ['Invalid size.', '大小无效。'],
  'Vault exceeds the probe limit.': [
    'Vault exceeds the probe limit.',
    '保险库超出测试限制。',
  ],
  'Unsupported vault format.': [
    'Unsupported vault format.',
    '不支持此保险库格式。',
  ],
  'Incomplete vault.': ['Incomplete vault.', '保险库不完整。'],
  'Invalid voice message duration or format.': [
    'Invalid voice message duration or format.',
    '语音消息时长或格式无效。',
  ],
  'Voice message size mismatch.': [
    'Voice message size mismatch.',
    '语音消息大小不匹配。',
  ],
  'Voice message format not allowed.': [
    'Voice message format not allowed.',
    '不支持此语音消息格式。',
  ],
  'Invalid return browser.': ['Invalid return browser.', '返回浏览器无效。'],
  'Invalid Solana address.': ['Invalid Solana address.', 'Solana 地址无效。'],
  'Invalid address.': ['Invalid address.', '地址无效。'],
  'Invalid EVM address.': ['Invalid EVM address.', 'EVM 地址无效。'],
  'The opening destination was changed.': [
    'The opening destination was changed.',
    '打开目标已更改。',
  ],
  'Identities changed during the call. Try again.': [
    'Identities changed during the call. Try again.',
    '通话期间身份已更改。请重试。',
  ],
  'Call invitation mismatch.': [
    'Call invitation mismatch.',
    '通话邀请不匹配。',
  ],
  'Message belongs to another pair.': [
    'Message belongs to another pair.',
    '消息属于其他会话双方。',
  ],
  'Video must be at most {0} seconds long.': [
    'Video must be at most {0} seconds long.',
    '视频时长不得超过 {0} 秒。',
  ],
  'Incomplete image.': ['Incomplete image.', '图片不完整。'],
  'Truncated PNG.': ['Truncated PNG.', 'PNG 数据被截断。'],
  'Truncated JPEG.': ['Truncated JPEG.', 'JPEG 数据被截断。'],
  'Gallery exceeds the limit.': [
    'Gallery exceeds the limit.',
    '图库超出限制。',
  ],
  'Duplicate cases.': ['Duplicate cases.', '案例重复。'],
  'profile.mutual-and': [' and ', '和'],
  'Media metadata exceeds the limit.': [
    'Media metadata exceeds the limit.',
    '媒体元数据超出限制。',
  ],
  'Media inspection incomplete.': [
    'Media inspection incomplete.',
    '媒体检查不完整。',
  ],
  'Invalid media sequence.': ['Invalid media sequence.', '媒体序列无效。'],
  'Media sequence is empty or exceeds the limit.': [
    'Media sequence is empty or exceeds the limit.',
    '媒体序列为空或超出限制。',
  ],
  'Media decoding incomplete.': [
    'Media decoding incomplete.',
    '媒体解码不完整。',
  ],
  'Media analysis coverage is incomplete.': [
    'Media analysis coverage is incomplete.',
    '媒体分析覆盖不完整。',
  ],
  'Invalid media frame.': ['Invalid media frame.', '媒体帧无效。'],
  'Media sequence exceeds the limit.': [
    'Media sequence exceeds the limit.',
    '媒体序列超出限制。',
  ],
  'Invalid media analysis dimensions.': [
    'Invalid media analysis dimensions.',
    '媒体分析尺寸无效。',
  ],
  'Invalid prepared media.': ['Invalid prepared media.', '已准备的媒体无效。'],
  'Invalid media analysis coverage.': [
    'Invalid media analysis coverage.',
    '媒体分析覆盖无效。',
  ],
  'Media analysis model or policy mismatch.': [
    'Media analysis model or policy mismatch.',
    '媒体分析模型或策略不匹配。',
  ],
  'Prepared media mismatch.': [
    'Prepared media mismatch.',
    '已准备的媒体不匹配。',
  ],
  'Public analysis unavailable.': [
    'Public analysis unavailable.',
    '公开内容分析不可用。',
  ],
  'Invalid media duration.': ['Invalid media duration.', '媒体时长无效。'],
  'Invalid media frame rate.': ['Invalid media frame rate.', '媒体帧率无效。'],
  'ranking.biggest': ['Biggest', '最大'],
  'Create new invitation': ['Create new invitation', '创建新邀请'],
  'People who know your wallet address can send you a chat invitation': [
    'People who know your wallet address can send you a chat invitation',
    '知道你钱包地址的人可以向你发送聊天邀请',
  ],
  'Invitation ready: one use, valid for 24 hours. Previous invitations remain valid.':
    [
      'Invitation ready: one use, valid for 24 hours. Previous invitations remain valid.',
      '邀请已就绪：仅可使用一次，24小时内有效。此前的邀请仍然有效。',
    ],
  'This invitation was revoked. Other invitations remain valid.': [
    'This invitation was revoked. Other invitations remain valid.',
    '此邀请已撤销，其他邀请仍然有效。',
  ],
  'Create a new invitation.': ['Create a new invitation.', '请创建新邀请。'],
  'Generate a single-use invitation instead.': [
    'Generate a single-use invitation instead.',
    '请改为生成一次性邀请。',
  ],
  'Invalid invitation expiry.': [
    'Invalid invitation expiry.',
    '邀请到期时间无效。',
  ],
  'Notification sender changed.': [
    'Notification sender changed.',
    '通知发送者已更改。',
  ],
  'Only people with an unused invitation can find your private account and request a chat. Each invitation expires after 24 hours and allows one request. New invitations are independent; you still choose whether to accept.':
    [
      'Only people with an unused invitation can find your private account and request a chat. Each invitation expires after 24 hours and allows one request. New invitations are independent; you still choose whether to accept.',
      '只有持有未使用邀请的人才能找到你的私人账户并申请聊天。每个邀请在24小时后到期，仅可申请一次。新邀请彼此独立，你仍可选择是否接受。',
    ],
};
