# AQTO Protocol

Permissionless on-chain program for Token-2022 mints with the **Transfer Fee** extension.
Anyone can call it: withheld transfer fees are collected and **80% is burned, 20% goes to whoever sent the transaction**.
There is no treasury, no admin wallet and no configuration account.

*Русская версия — [ниже](#aqto-protocol-ru).*

| | |
|---|---|
| Program ID | `GuXxGU2xwGHo9Bw3Xfk1EqLvyVdgLomfJm5vXQPu1h9e` |
| AQTO Mint | `8c3GYqkKPdsZ7RKc9ePTZxhz4wstW3HS7xvocRbEmAmR` |
| Vault Authority PDA | `7HKGXNUGDBLPgYaEP82bxYYbTAWL7cMrU1UAHbtwhMLu` (seed `vault-authority`) |
| Source | https://github.com/AQTO-lab/protocol |
| Security policy | [SECURITY.md](SECURITY.md) |

---

## How it works

A single instruction, `harvest_and_distribute`, does the following in one transaction:

1. **Harvest** withheld fees from the token accounts passed in `remaining_accounts` into the mint (permissionless on the Token-2022 side). The list may be empty if fees already sit on the mint.
2. **Withdraw** the withheld fees from the mint into the vault (the ATA of the `vault-authority` PDA). The PDA signs; it must be the mint's *withdraw withheld authority*.
3. **Split** the vault balance: `caller = total / 5`, `burn = total - caller` (the rounding remainder is burned, so the shares always sum to `total`).
4. **Burn** 80%, **pay** 20% to the caller's token account, **emit** `DistributionEvent { mint, total_collected, burned, caller_reward, caller }`.

Any Token-2022 mint can use the program: its owner hands the *withdraw withheld authority* to the PDA, creates the vault ATA once, and from then on anyone can trigger distribution.

## What changed in this version

The treasury share was removed: the split went from 80 / 15 / 5 (burn / caller / treasury) to **80 / 20 (burn / caller)**.

| Area | Before | Now |
|---|---|---|
| Recipients | burn, caller, hard-coded treasury | burn, caller |
| Token transfers (CPI) per call | 2 | 1 (and 0 when the reward rounds to zero) |
| Accounts in the instruction | includes treasury token account | treasury account removed |
| Share arithmetic | `u128` with checked conversions | plain `u64` (`total / 5` cannot overflow) |
| Hard-coded wallets | treasury pubkey in the binary | none |
| Errors | 4 | 1 (`NothingToDistribute`) |
| Empty `remaining_accounts` | rejected | allowed (collects fees already on the mint) |

### Why it is cheaper

- **Compute units:** one token-transfer CPI fewer, simpler arithmetic (no `u128`, no `try_from`/`checked_sub` chain), one account fewer to validate. The reward transfer is skipped entirely when it would be zero.
- **Transaction fee:** one account fewer in the instruction makes the transaction smaller; the base fee is unchanged, the priority fee depends on the CU limit you request.
- **Deploy cost:** less code means a smaller `.so`, and program rent is proportional to program size.

> Measured numbers (fill in from your own build and test run, do not guess):
>
> | Metric | Before | Now |
> |---|---|---|
> | `.so` size, bytes | _TBD_ | _TBD_ |
> | CU per call (N source accounts) | _TBD_ | _TBD_ |
>
> CU can be read from the `consumed … of … compute units` lines in the transaction logs.

## Trust model

- **No privileged wallet.** No treasury, no admin, no config account. Nobody receives a share except the caller and the burn.
- **Permissionless.** Anyone can call the instruction; the caller chooses which source accounts to harvest, so nobody can grief another caller.
- **Immutable.** The upgrade authority is planned to be revoked after verification (`solana program set-upgrade-authority … --final`). Status: `[ ] revoked` — update this line after it is done and link the transaction.
- **Verifiable build.** The deployed binary can be checked against this repository with `solana-verify` (see below).
- **Isolation.** The vault is a separate ATA per mint. A problem with one token (frozen vault, unsupported extension) affects only that token.
- **Token program pinned.** Only Token-2022 is accepted (`address = token_2022::ID`).
- **Vault pinned.** The vault must be the canonical ATA of the PDA for the given mint, verified by derivation.

## Verify the build

Requires Docker and `solana-verify` (`cargo install solana-verify --locked`).

```bash
git clone https://github.com/AQTO-lab/protocol.git
cd protocol
git checkout a2f1ebfd0ed5a6a354193804c73f08f393400a8d

solana-verify build --library-name aqto_protocol
solana-verify get-executable-hash target/deploy/aqto_protocol.so

# hash of what is deployed on-chain — it must match the line above
solana-verify get-program-hash -u <RPC_URL> GuXxGU2xwGHo9Bw3Xfk1EqLvyVdgLomfJm5vXQPu1h9e

# or check directly against the repository
solana-verify verify-from-repo -u <RPC_URL> \
  --program-id GuXxGU2xwGHo9Bw3Xfk1EqLvyVdgLomfJm5vXQPu1h9e \
  --library-name aqto_protocol \
  --commit-hash a2f1ebfd0ed5a6a354193804c73f08f393400a8d \
  https://github.com/AQTO-lab/protocol
```

The program source is identical in every later commit that only touches documentation; the commit above is the one the binary was built from.

## Usage

**For a token owner**
1. Create the vault: the ATA of the PDA `7HKG…hMLu` for your mint, using the Token-2022 program (once, idempotent).
2. Set the mint's *withdraw withheld authority* to the PDA (`spl-token authorize`, see `spl-token authorize --help` for the exact authority type). **This is irreversible in this program: there is no instruction that returns the authority.**

**For a caller (bot or user)**
1. Find token accounts of the mint with withheld fees > 0.
2. Call `harvest_and_distribute` with `caller`, `mint`, `vault`, `vault_authority`, `caller_token_account`, `token_program`, and the source accounts (writable) in `remaining_accounts` — up to roughly 20 per transaction.
3. Receive 20% of the collected amount.

A reference script is in `harvestv2.js` (`--dry` shows accumulated fees without sending anything).

## Known limitations (read before integrating)

- **Transfer fee on the reward.** The reward transfer to the caller is itself subject to the mint's transfer fee, so the amount that lands can be lower than `caller_reward` in the event. The remainder stays withheld on the caller's account and is collected by the next harvest.
- **Tiny amounts.** If the vault holds fewer than 5 base units, the caller reward is 0 (the call still succeeds and burns everything). An empty vault returns `NothingToDistribute`.
- **Authority handover is permanent.** Once a mint gives its withdraw-withheld authority to the PDA, it cannot get it back.
- **Incompatible mints.** Mints with a transfer hook, a frozen vault or caller account, or confidential transfer fees may not work with this program. Such failures are isolated to that mint.
- **Vault must exist.** The vault ATA has to be created before the first call.
- **No external audit yet** (`auditors: None` in the embedded security.txt). Review the code before relying on it.

## Tests

```bash
cargo test
```

Unit tests cover the split arithmetic (sums, exact values, tiny amounts, `u64::MAX`). Integration tests on a real Token-2022 mint with transfer fees are recommended before relying on any deployment.

## Security

Report vulnerabilities as described in [SECURITY.md](SECURITY.md) or use the contacts in the on-chain `security.txt`:
`aqtoprotocol@gmail.com`, Telegram https://t.me/aqtoprotocol, X/Twitter @AQTOprotocol.

---

<a id="aqto-protocol-ru"></a>

# AQTO Protocol (RU)

Программа без разрешений для минтов Token-2022 с расширением **Transfer Fee**.
Вызвать её может любой: удержанные комиссии собираются, **80% сжигается, 20% получает отправитель транзакции**.
Казны, админ-кошелька и конфигурационного аккаунта нет.

| | |
|---|---|
| Program ID | `GuXxGU2xwGHo9Bw3Xfk1EqLvyVdgLomfJm5vXQPu1h9e` |
| Mint AQTO | `8c3GYqkKPdsZ7RKc9ePTZxhz4wstW3HS7xvocRbEmAmR` |
| Vault Authority PDA | `7HKGXNUGDBLPgYaEP82bxYYbTAWL7cMrU1UAHbtwhMLu` (seed `vault-authority`) |

## Как это работает

Одна инструкция `harvest_and_distribute` за одну транзакцию:

1. **Harvest:** собирает удержанные комиссии со счетов из `remaining_accounts` на минт. Список может быть пустым, если комиссии уже лежат на минте.
2. **Withdraw:** выводит комиссии с минта в vault (ATA PDA `vault-authority`). PDA подписывает и должен быть *withdraw withheld authority* минта.
3. **Деление:** `caller = total / 5`, `burn = total - caller`. Остаток от округления сжигается, поэтому доли всегда дают `total`.
4. **Burn** 80%, **перевод** 20% вызывающему, событие `DistributionEvent { mint, total_collected, burned, caller_reward, caller }`.

Работает с любым минтом Token-2022: владелец передаёт PDA право *withdraw withheld authority*, один раз создаёт vault (ATA), после этого распределение может запустить любой.

## Что изменилось

Доля казны убрана: распределение вместо 80 / 15 / 5 (сжигание / вызывающий / казна) стало **80 / 20 (сжигание / вызывающий)**.

- Один CPI-перевод вместо двух (а когда награда округляется до 0, переводов нет вовсе).
- Одним аккаунтом меньше в инструкции, транзакция легче.
- Арифметика на `u64` вместо `u128`: `total / 5` не может переполниться.
- В бинарнике нет захардкоженных кошельков, ошибок стало одна вместо четырёх.
- Пустой `remaining_accounts` разрешён.
- **Расходы:** меньше CU на вызов, меньше размер `.so` (а значит, и аренда программы при деплое). Точные цифры вставьте после своих измерений (таблица выше с пометкой _TBD_), не оценивайте на глаз.

## Модель доверия

- Нет привилегированного кошелька: получатели только сжигание и вызывающий.
- Вызов без разрешений, список счетов выбирает сам вызывающий, поэтому один вызывающий не может навредить другому.
- Права на обновление программы планируется отозвать после верификации (`--final`). Статус: `[ ] отозваны` (обновите после выполнения и добавьте ссылку на транзакцию).
- Бинарник проверяется командами из раздела «Verify the build» (хеш коммита `a2f1ebfd0ed5a6a354193804c73f08f393400a8d`).
- Vault у каждого минта свой, проблемный токен не влияет на остальные.
- Принимается только Token-2022, vault проверяется по ATA-деривации.

## Известные ограничения

- Награда вызывающему сама облагается комиссией минта, поэтому на счёт может прийти меньше `caller_reward` из события. Остаток удержится на счёте и будет собран следующим harvest.
- Если в vault меньше 5 минимальных единиц, награда равна 0, но вызов проходит успешно (всё сжигается). Пустой vault даёт `NothingToDistribute`.
- Передача authority программе необратима.
- Минты с transfer hook, замороженными счетами или confidential transfer fee могут не работать, но отказ касается только такого минта.
- Vault нужно создать до первого вызова.
- Внешнего аудита пока нет. Изучите код, прежде чем полагаться на программу.

## Безопасность

Об уязвимостях сообщайте по инструкции в [SECURITY.md](SECURITY.md) или по контактам из `security.txt`: `aqtoprotocol@gmail.com`, Telegram https://t.me/aqtoprotocol, @AQTOprotocol.
