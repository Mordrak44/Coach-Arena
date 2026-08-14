import { useState } from 'react'
import type { CardId, Character } from './game/types'
import { ROSTER, pickOpponent } from './game/characters'
import { buildStarterDeck } from './game/cards'
import { applyBond, recordResult } from './game/progression'
import {
  consumeTraining,
  getStable,
  moodIgnoresFirstOrder,
  moodStartHype,
  recordMatchMood,
} from './game/stable'
import type { MatchOpts } from './game/combat'
import { useRef } from 'react'
import TitleScreen from './ui/TitleScreen'
import CharacterSelect from './ui/CharacterSelect'
import ReadyScreen from './ui/ReadyScreen'
import ArenaScreen, { type MatchOutcome } from './ui/ArenaScreen'
import ResultsScreen from './ui/ResultsScreen'

type Screen = 'title' | 'select' | 'ready' | 'arena' | 'results'

// Mode démo (?demo) : saute directement dans l'arène sans capteurs — pour
// les captures d'écran, le press kit et les tests visuels automatisés.
const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')

export default function App() {
  const [screen, setScreen] = useState<Screen>(DEMO ? 'arena' : 'title')
  const [player, setPlayer] = useState<Character | null>(DEMO ? ROSTER[0] : null)
  const [enemy, setEnemy] = useState<Character | null>(DEMO ? ROSTER[4] : null)
  const [outcome, setOutcome] = useState<MatchOutcome | null>(null)
  const [matchKey, setMatchKey] = useState(0)
  const [deck, setDeck] = useState<CardId[]>(() => buildStarterDeck(null))

  const streamRef = useRef<MediaStream | null>(null)
  const matchOptsRef = useRef<MatchOpts>({})
  // Perso de BASE (non modifié) : la Revanche repart toujours de lui, sinon
  // les bonus de Lien/entraînement s'empileraient à chaque match.
  const baseCharRef = useRef<Character | null>(null)

  const startMatch = (char: Character, chosenDeck?: CardId[]) => {
    if (chosenDeck) setDeck(chosenDeck)
    baseCharRef.current = char
    let fighter = applyBond(char) // le Lien booste le Cœur du perso
    // Vie d'Écurie : humeur → Hype de départ / bouderie ; entraînement → +1 stat.
    const stable = getStable(char.id, char.trait)
    const trained = consumeTraining(char.id)
    if (trained) {
      fighter = {
        ...fighter,
        stats: { ...fighter.stats, [trained]: Math.min(12, fighter.stats[trained] + 1) },
      }
    }
    matchOptsRef.current = {
      startHype: moodStartHype(stable.mood),
      sulky: moodIgnoresFirstOrder(stable.mood),
    }
    setPlayer(fighter)
    setEnemy(pickOpponent(char.id))
    setScreen('ready') // le Vestiaire : annonce du match + permissions
  }

  const enterArena = (stream: MediaStream | null) => {
    streamRef.current = stream
    setMatchKey(k => k + 1)
    setScreen('arena')
  }

  return (
    <div className="app">
      <div className="stage">
        {screen === 'title' && <TitleScreen onStart={() => setScreen('select')} />}
        {screen === 'select' && <CharacterSelect onConfirm={startMatch} />}
        {screen === 'ready' && player && enemy && (
          <ReadyScreen player={player} enemy={enemy} onGo={enterArena} />
        )}
        {screen === 'arena' && player && enemy && (
          <ArenaScreen
            key={matchKey}
            player={player}
            enemy={enemy}
            deck={deck}
            matchOpts={matchOptsRef.current}
            preStream={streamRef.current}
            noMedia={DEMO}
            onFinish={o => {
              recordResult(player.id, o.winner === 'player')
              recordMatchMood(player.id, o.winner === 'player')
              setOutcome(o)
              setScreen('results')
            }}
          />
        )}
        {screen === 'results' && player && outcome && (
          <ResultsScreen
            player={player}
            outcome={outcome}
            onReplay={() => startMatch(baseCharRef.current ?? player)}
            onNewChar={() => setScreen('select')}
          />
        )}
      </div>
    </div>
  )
}
