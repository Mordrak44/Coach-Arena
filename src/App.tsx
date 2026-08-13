import { useState } from 'react'
import type { CardId, Character } from './game/types'
import { pickOpponent } from './game/characters'
import { DEFAULT_DECK } from './game/cards'
import { applyBond, recordResult } from './game/progression'
import TitleScreen from './ui/TitleScreen'
import CharacterSelect from './ui/CharacterSelect'
import ArenaScreen, { type MatchOutcome } from './ui/ArenaScreen'
import ResultsScreen from './ui/ResultsScreen'

type Screen = 'title' | 'select' | 'arena' | 'results'

export default function App() {
  const [screen, setScreen] = useState<Screen>('title')
  const [player, setPlayer] = useState<Character | null>(null)
  const [enemy, setEnemy] = useState<Character | null>(null)
  const [outcome, setOutcome] = useState<MatchOutcome | null>(null)
  const [matchKey, setMatchKey] = useState(0)
  const [deck, setDeck] = useState<CardId[]>(DEFAULT_DECK)

  const startMatch = (char: Character, chosenDeck?: CardId[]) => {
    if (chosenDeck) setDeck(chosenDeck)
    setPlayer(applyBond(char)) // le Lien booste le Cœur du perso
    setEnemy(pickOpponent(char.id))
    setMatchKey(k => k + 1)
    setScreen('arena')
  }

  return (
    <div className="app">
      <div className="stage">
        {screen === 'title' && <TitleScreen onStart={() => setScreen('select')} />}
        {screen === 'select' && <CharacterSelect onConfirm={startMatch} />}
        {screen === 'arena' && player && enemy && (
          <ArenaScreen
            key={matchKey}
            player={player}
            enemy={enemy}
            deck={deck}
            onFinish={o => {
              recordResult(player.id, o.winner === 'player')
              setOutcome(o)
              setScreen('results')
            }}
          />
        )}
        {screen === 'results' && player && outcome && (
          <ResultsScreen
            player={player}
            outcome={outcome}
            onReplay={() => startMatch(player)}
            onNewChar={() => setScreen('select')}
          />
        )}
      </div>
    </div>
  )
}
