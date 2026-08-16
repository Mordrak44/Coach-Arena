import { useState } from 'react'
import type { CardId, Character } from './game/types'
import { ROSTER, pickOpponent, pickOpponentTeam } from './game/characters'
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
import StoryScreen from './ui/StoryScreen'
import PrivacyScreen from './ui/PrivacyScreen'
import {
  type StoryChapter,
  chapterEnemyDeck,
  chapterOpponent,
  chapterOpponentTeam,
  markCleared,
} from './game/story'

type Screen = 'title' | 'story' | 'select' | 'ready' | 'arena' | 'results' | 'privacy'

// Mode démo (?demo) : saute directement dans l'arène sans capteurs — pour
// les captures d'écran, le press kit et les tests visuels automatisés.
// ?demo=fast : temps de jeu ×6 (atteindre l'écran de résultats en ~40 s).
const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')
const DEMO_FAST =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === 'fast'

export default function App() {
  const [screen, setScreen] = useState<Screen>(DEMO ? 'arena' : 'title')
  const [player, setPlayer] = useState<Character | null>(DEMO ? ROSTER[0] : null)
  const [enemy, setEnemy] = useState<Character | null>(DEMO ? ROSTER[4] : null)
  const [outcome, setOutcome] = useState<MatchOutcome | null>(null)
  const [matchKey, setMatchKey] = useState(0)
  const [deck, setDeck] = useState<CardId[]>(() => buildStarterDeck(null))

  const streamRef = useRef<MediaStream | null>(null)
  // En démo : un match d'équipe (montre le HUD de banc dans les captures).
  const matchOptsRef = useRef<MatchOpts>(
    DEMO ? { team: [ROSTER[2]], enemyTeam: [ROSTER[5]], startHype: 30 } : {},
  )
  // Perso de BASE (non modifié) : la Revanche repart toujours de lui, sinon
  // les bonus de Lien/entraînement s'empileraient à chaque match.
  const baseCharRef = useRef<Character | null>(null)
  const baseTeamRef = useRef<Character[]>([])
  /** chapitre d'Histoire en cours (null = match rapide) */
  const storyRef = useRef<StoryChapter | null>(null)

  const startMatch = (char: Character, chosenDeck?: CardId[], team: Character[] = baseTeamRef.current) => {
    if (chosenDeck) setDeck(chosenDeck)
    baseCharRef.current = char
    baseTeamRef.current = team
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
    // L'Écurie en match : chaque équipier monte avec SON Lien. En Histoire,
    // l'adversaire et son équipe sont ceux du chapitre ; sinon l'adversaire
    // aligne une équipe de même taille que la tienne (roster, sans doublons).
    const teamFighters = team.map(t => applyBond(t))
    const story = storyRef.current
    const opponent = story ? chapterOpponent(story) : pickOpponent(char.id)
    const enemyTeam = story
      ? chapterOpponentTeam(story)
      : pickOpponentTeam([char.id, opponent.id, ...team.map(t => t.id)], teamFighters.length)
    matchOptsRef.current = {
      startHype: moodStartHype(stable.mood),
      sulky: moodIgnoresFirstOrder(stable.mood),
      team: teamFighters,
      enemyTeam,
      enemyDeck: story ? chapterEnemyDeck(story) : undefined,
    }
    setPlayer(fighter)
    setEnemy(opponent)
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
        {screen === 'title' && (
          <TitleScreen
            onStart={() => {
              storyRef.current = null
              setScreen('select')
            }}
            onStory={() => setScreen('story')}
            onPrivacy={() => setScreen('privacy')}
          />
        )}
        {screen === 'privacy' && <PrivacyScreen onBack={() => setScreen('title')} />}
        {screen === 'story' && (
          <StoryScreen
            onPick={ch => {
              storyRef.current = ch
              setScreen('select')
            }}
            onBack={() => setScreen('title')}
          />
        )}
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
            speed={DEMO_FAST ? 6 : 1}
            onFinish={o => {
              recordResult(player.id, o.winner === 'player')
              recordMatchMood(player.id, o.winner === 'player')
              if (storyRef.current && o.winner === 'player') markCleared(storyRef.current.id)
              setOutcome(o)
              setScreen('results')
            }}
          />
        )}
        {screen === 'results' && player && outcome && (
          <ResultsScreen
            player={player}
            outcome={outcome}
            storyOutro={
              storyRef.current && outcome.winner === 'player' ? storyRef.current.outro : null
            }
            onReplay={() => startMatch(baseCharRef.current ?? player)}
            onNewChar={() => setScreen(storyRef.current ? 'story' : 'select')}
          />
        )}
      </div>
    </div>
  )
}
