# FinStrategy — offline glassmorphism sim

FinStrategy — это пошаговая финансовая игра (React 18 + Vite + Zustand) c неоморфно-glassmorphism интерфейсом и нативными обёртками Capacitor для Android/iOS. Веб-ассеты лежат локально (без CDN), поэтому игра готова к оффлайн-режиму и поставляется вместе с входными конфигами из `/public/config`.

## Быстрый старт (web)

1. `npm install`
2. `npm run dev` — локальный режим разработки
3. `npm run build` — production-сборка в `dist/`
4. `npm run preview` — быстрый smoke-тест собранной версии

Состояние хранится в `localStorage` (ключ `finstrategy-store`) и восстанавливается между сессиями автоматически.

## Capacitor / нативные обёртки

В репозитории уже добавлены `android/` и `ios/` проекты. Скрипты в `package.json`:

| Действие | Команда |
| --- | --- |
| Синхронизировать web → native | `npm run build && npm run cap:sync` |
| Открыть Android Studio | `npm run cap:android` |
| Открыть Xcode | `npm run cap:ios` |

> Перед `cap:android`/`cap:ios` обязательно соберите веб (`npm run build`) и выполните `npm run cap:sync`, чтобы в каталоги платформ попали оффлайн ассеты.

## Где лежат конфиги

```
public/config/
├── professions.json
├── markets.json
├── instruments.json
└── game_rules.json
```

Файлы можно править без пересборки — Vite автоматически подхватит новые значения. В продакшн-версии эти JSON попадают в `dist/config/...` и будут упакованы внутрь проектов Capacitor.

## Как работает симуляция

* **Детерминированный RNG.** Используется `mulberry32` с seed из `localStorage` (`finstrategy_rng_seed`). Seed сохраняется и передаётся в симулятор рынков и действия игрока (`src/store/gameStore.js`).
* **Коррелированные рынки.** `markets.json` задаёт корреляционную матрицу; внутри `simulateMarkets` строится разложение Холецкого и генерируются коррелированные приращения лог-доходностей.
* **Циклы и шоки.** Для акций/крипты применяются синусоиды (`cycles`) и Compound Poisson-шоки (`shockModel`). Каждый шок ведёт учёт cooldown и добавляет отклонение в лог-доходность.
* **Game Rules.** Стоимость жизни считается по профессии (`game_rules.livingCost`), кредитный лимит — по формуле из `game_rules.loans.creditLimit`. Победы/поражения считаются streak-ами (`evaluateGoals`).
* **Автосейв.** Все действия (`applyHomeAction`, `buyInstrument`, `advanceMonth` и т.д.) автоматически попадают в Zustand Persist → localStorage, поэтому прогресс не теряется даже оффлайн.

## Как изменить баланс / экономику

1. **Через UI.** На главном экране доступны действия (Сайд-проект, Платёж по кредиту и т.д.) — они сразу меняют состояние и записываются в журнал.
2. **Через конфиги.** Измените стартовые значения в `public/config/professions.json` (например `startingMoney`, `salaryMonthly`), либо параметры инструментов/рынков в соответствующих JSON.
3. **Через код.** В `src/store/gameStore.js` находятся все экшены (от `buyInstrument` до `computeCreditLimit`). Можно добавить новые действия или поменять формулы прямо в одном месте.

## Архитектура

* `src/domain/` — RNG, финансовые расчёты, симулятор рынка.
* `src/store/gameStore.js` — Zustand-стор, автосохранение, модель игры.
* `src/components/` — UI-система (Card, Button, GradientButton, Modal, Slider, BottomNav, TopStats, SparkLine).
* `src/screens/` — экраны «Профессия», «Лента», «Инвестиции», «Статистика», `MainLayout` с неоморфным фоном и навигацией.

## Оффлайн режим

* Никаких внешних CDN (шрифты, иконки, данные, скрипты).
* Все ассеты поставляются в `public/` → попадают в `dist/`.
* Capacitor складывает `dist/` внутрь `android/app/src/main/assets/public` и `ios/App/App/public`, поэтому приложение полностью автономно.
