# Security Policy

*Русская версия — [ниже](#политика-безопасности).*

## Scope

This policy covers the AQTO Protocol on-chain program and its source code in this repository.

| | |
|---|---|
| Program ID | `GuXxGU2xwGHo9Bw3Xfk1EqLvyVdgLomfJm5vXQPu1h9e` |
| Vault Authority PDA | `7HKGXNUGDBLPgYaEP82bxYYbTAWL7cMrU1UAHbtwhMLu` |
| Repository | https://github.com/AQTO-lab/protocol |

**In scope**
- The program logic in `programs/` (fee harvesting, withdrawal, split, burn, reward transfer).
- Account validation and PDA/ATA derivation.
- Arithmetic, rounding and overflow behaviour.
- Any way to make the program move, burn or lock funds contrary to its documented behaviour (80% burn / 20% caller).
- Problems that make a supported mint permanently unusable.

**Out of scope**
- Bugs in the Solana runtime, the Token-2022 program, Anchor or other third-party dependencies (report those to their maintainers).
- Mints with extensions the program does not support (transfer hook, confidential transfer fees, etc.): this is a documented limitation, not a vulnerability.
- Loss caused by a token owner handing the withdraw-withheld authority to the PDA (the handover is documented as irreversible).
- Social engineering, phishing, attacks on websites or social accounts of third parties.
- Denial of service through spam, and issues that need a compromised user wallet.
- Findings that only affect devnet or test deployments and have no mainnet impact.
- Reports produced only by automated scanners without a demonstrated impact.

## Reporting a vulnerability

**Please do not open a public issue or discuss the problem publicly before it is fixed or mitigated.**

Contact, in order of preference:
1. GitHub private vulnerability reporting: the *Security* tab → *Report a vulnerability* in this repository (if enabled).
2. Email: `aqtoprotocol@gmail.com`
3. Telegram: https://t.me/aqtoprotocol (ask for a private channel; do not post details in public chats)
4. X/Twitter: @AQTOprotocol (only to request a private channel)

Please include:
- A clear description and the affected component.
- Steps to reproduce or a proof-of-concept (transaction on devnet / local validator is preferred; **do not test on mainnet with other users' funds**).
- The expected impact (which funds, who can trigger it, preconditions).
- Your suggested fix, if you have one.

Languages: English, Russian.

## What to expect

| Step | Target |
|---|---|
| Acknowledgement of your report | within 72 hours |
| Initial assessment and severity | within 7 days |
| Status updates | at least every 14 days |
| Fix or mitigation plan | depends on severity |

These are targets, not guarantees: the project is maintained by a small team.

## Immutable program notice

The upgrade authority of the program is planned to be revoked after build verification, which makes the deployed code **immutable**. Please read this carefully:

- After revocation a vulnerability **cannot be patched in place**. The only possible response is to publish a warning, advise users and token owners to stop using the affected deployment, and, if needed, deploy a new program under a new Program ID.
- Because of this, **the contact details embedded in the binary (`security.txt`) cannot be changed** either. This repository's `SECURITY.md` is the place where up-to-date contacts will be published, so please check it first.
- Severity assessment takes into account that every mint using the program has an independent vault, so a problem with one mint does not affect others, unless the flaw is in the shared program logic.

## Disclosure

- We follow coordinated disclosure. Please give us a reasonable time (we suggest up to 90 days, shorter if the issue is actively exploited) before publishing details.
- After a fix or mitigation is available, we will publish an advisory describing the issue, the impact and credit to the reporter (unless you prefer to stay anonymous).

## Safe harbor

We will not take legal action against researchers who:
- act in good faith and follow this policy;
- avoid privacy violations, data destruction and disruption of other users;
- test only on local validators or devnet with their own funds and accounts;
- stop and report immediately if they gain access to funds that are not theirs.

## Rewards

There is **no formal bug bounty program** at the moment. Voluntary rewards may be offered at the maintainers' discretion depending on severity and quality of the report, but nothing is promised in advance.

## Audits

The program has **not been audited by an external firm** (`auditors: None` in the embedded `security.txt`). Users and integrators should review the code themselves and verify the deployed binary against this repository:

```bash
solana-verify verify-from-repo -u <RPC_URL> \
  --program-id GuXxGU2xwGHo9Bw3Xfk1EqLvyVdgLomfJm5vXQPu1h9e \
  --library-name aqto_protocol \
  --commit-hash a2f1ebfd0ed5a6a354193804c73f08f393400a8d \
  https://github.com/AQTO-lab/protocol
```

---

# Политика безопасности

## Область действия

Политика распространяется на ончейн-программу AQTO Protocol и её исходный код в этом репозитории.

- Program ID: `GuXxGU2xwGHo9Bw3Xfk1EqLvyVdgLomfJm5vXQPu1h9e`
- Vault Authority PDA: `7HKGXNUGDBLPgYaEP82bxYYbTAWL7cMrU1UAHbtwhMLu`

**В области:** логика программы (сбор комиссий, вывод, деление, сжигание, выплата награды), проверки аккаунтов и вывод PDA/ATA, арифметика и округление, любая возможность переместить, сжечь или заблокировать средства вопреки задокументированному поведению (80% сжигание / 20% вызывающему), а также ошибки, из-за которых поддерживаемый минт навсегда перестаёт работать.

**Вне области:** ошибки Solana, Token-2022, Anchor и других зависимостей (сообщайте их авторам); минты с неподдерживаемыми расширениями (transfer hook, confidential transfer fees и т.д.), это задокументированное ограничение; потери из-за передачи authority программе (она необратима и описана в README); социальная инженерия и фишинг; DoS спамом; проблемы, требующие компрометации кошелька пользователя; находки только для devnet без влияния на mainnet; отчёты автоматических сканеров без демонстрации последствий.

## Как сообщить об уязвимости

**Не создавайте публичные issue и не обсуждайте проблему публично до её исправления или смягчения.**

Каналы, в порядке предпочтения:
1. Приватное сообщение через GitHub: вкладка *Security* → *Report a vulnerability* (если включено).
2. Email: `aqtoprotocol@gmail.com`
3. Telegram: https://t.me/aqtoprotocol (попросите приватный канал, подробности в общих чатах не публикуйте)
4. X/Twitter: @AQTOprotocol (только чтобы запросить приватный канал)

Укажите: описание и затронутый компонент; шаги воспроизведения или PoC (лучше на devnet или локальном валидаторе, **не тестируйте на mainnet с чужими средствами**); ожидаемые последствия (чьи средства, кто может запустить, условия); ваше предложение по исправлению, если оно есть.

## Чего ожидать

- Подтверждение получения: в течение 72 часов.
- Первичная оценка и серьёзность: в течение 7 дней.
- Обновления статуса: не реже раза в 14 дней.
- План исправления или смягчения: зависит от серьёзности.

Это ориентиры, а не гарантии: проект ведёт небольшая команда.

## Важно: программа неизменяема

Права на обновление программы планируется отозвать после верификации сборки, после чего код **нельзя будет изменить**.

- После отзыва прав уязвимость **нельзя исправить на месте**. Возможные действия: опубликовать предупреждение, рекомендовать пользователям и владельцам токенов прекратить использование, при необходимости развернуть новую программу с новым Program ID.
- Контакты, зашитые в бинарник (`security.txt`), тоже **нельзя изменить**. Актуальные контакты публикуются в `SECURITY.md` этого репозитория, поэтому проверяйте их в первую очередь.
- При оценке серьёзности учитывается, что у каждого минта свой vault, поэтому проблема одного минта не затрагивает остальные, если только ошибка не в общей логике программы.

## Раскрытие информации

- Мы придерживаемся скоординированного раскрытия. Дайте разумное время до публикации деталей (предлагаем до 90 дней, меньше, если уязвимость уже эксплуатируется).
- После исправления или смягчения мы опубликуем описание проблемы, последствий и благодарность автору (если вы не предпочитаете остаться анонимным).

## Безопасная гавань

Мы не будем предпринимать юридических действий против исследователей, которые действуют добросовестно и следуют этой политике, не нарушают приватность и не мешают другим пользователям, тестируют только на локальном валидаторе или devnet со своими средствами и немедленно прекращают тестирование и сообщают нам, если получили доступ к чужим средствам.

## Вознаграждения

Формальной программы bug bounty **нет**. По решению мейнтейнеров возможны добровольные вознаграждения в зависимости от серьёзности и качества отчёта, но заранее ничего не обещается.

## Аудит

Внешнего аудита программа **не проходила** (`auditors: None` в `security.txt`). Изучите код сами и проверьте развёрнутый бинарник командой `solana-verify verify-from-repo` из блока выше.
