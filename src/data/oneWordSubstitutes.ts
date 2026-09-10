import type { BankEntry } from '../lib/types'

/**
 * Unlike vocabulary/idioms, here `term` is the descriptive phrase and `meaning` is the
 * single word that replaces it — matching the classic exam format ("replace the phrase
 * with one word"), where the phrase is given and the word is what's being tested.
 */
export const ONE_WORD_BANK: BankEntry[] = [
  // Easy
  { id: 'bibliophile', term: 'A person who loves or collects books', meaning: 'Bibliophile', difficulty: 'easy', hint: "Starts with 'Bi-', related to books", example: 'He is a true bibliophile, always surrounded by books.' },
  { id: 'orphan', term: 'A child whose parents are dead', meaning: 'Orphan', difficulty: 'easy', hint: 'Think of a child without parents', example: 'The orphan was raised in a children\'s home.' },
  { id: 'bachelor', term: 'An unmarried man', meaning: 'Bachelor', difficulty: 'easy', hint: 'Think of an unmarried male', example: 'He remained a bachelor throughout his life.' },
  { id: 'widow', term: 'A woman whose husband has died', meaning: 'Widow', difficulty: 'easy', hint: 'Think of a woman who lost her husband', example: 'The widow lived alone after her husband\'s death.' },
  { id: 'optimist', term: 'A person who always expects the best', meaning: 'Optimist', difficulty: 'easy', hint: 'Opposite of pessimist', example: 'She is an optimist who always sees the bright side.' },
  { id: 'pessimist', term: 'A person who always expects the worst', meaning: 'Pessimist', difficulty: 'easy', hint: 'Opposite of optimist', example: 'He is a pessimist who expects everything to go wrong.' },
  { id: 'autobiography', term: "The story of a person's life written by that person", meaning: 'Autobiography', difficulty: 'easy', hint: '"Auto" means self', example: 'He wrote an autobiography about his early struggles.' },
  { id: 'biography', term: "The story of a person's life written by someone else", meaning: 'Biography', difficulty: 'easy', hint: 'Written by another person about a life', example: 'She wrote a biography of the famous scientist.' },
  { id: 'herbivore', term: 'An animal that eats only plants', meaning: 'Herbivore', difficulty: 'easy', hint: 'Think of plant-eating animals', example: 'The deer is a herbivore.' },
  { id: 'carnivore', term: 'An animal that eats only meat', meaning: 'Carnivore', difficulty: 'easy', hint: 'Think of meat-eating animals', example: 'The lion is a carnivore.' },
  { id: 'contemporary', term: 'A person living at the same time as another', meaning: 'Contemporary', difficulty: 'easy', hint: 'Think of "same era"', example: 'Einstein and Gandhi were contemporaries.' },
  { id: 'illiterate', term: 'A person who cannot read or write', meaning: 'Illiterate', difficulty: 'easy', hint: 'Opposite of literate', example: 'The program aims to teach illiterate adults to read.' },
  { id: 'immigrant', term: 'A person who comes to live permanently in a foreign country', meaning: 'Immigrant', difficulty: 'easy', hint: 'Think of moving into a new country', example: 'Many immigrants settled in the city.' },
  { id: 'emigrant', term: 'A person who leaves their own country to settle in another', meaning: 'Emigrant', difficulty: 'easy', hint: "Think of leaving one's own country", example: 'He was an emigrant from Ireland.' },
  { id: 'amateur', term: 'A person who engages in an activity for pleasure, not as a profession', meaning: 'Amateur', difficulty: 'easy', hint: 'Opposite of professional', example: 'He is an amateur photographer.' },
  { id: 'culprit', term: 'A person who is guilty of a crime', meaning: 'Culprit', difficulty: 'easy', hint: 'Think of the guilty party', example: 'The police caught the culprit red-handed.' },
  { id: 'fugitive', term: 'A person who is running away, especially from the law', meaning: 'Fugitive', difficulty: 'easy', hint: 'Think of someone escaping the law', example: 'The fugitive was captured at the border.' },
  { id: 'miser', term: 'A person who hoards money and hates spending it', meaning: 'Miser', difficulty: 'easy', hint: 'Think of an extremely stingy person', example: 'The miser refused to spend a single rupee.' },
  { id: 'orphanage', term: 'A place where orphan children are looked after', meaning: 'Orphanage', difficulty: 'easy', hint: 'A home for children without parents', example: 'She donates regularly to the local orphanage.' },
  { id: 'tenant', term: 'A person who rents land or property from a landlord', meaning: 'Tenant', difficulty: 'easy', hint: 'Think of someone who pays rent', example: 'The tenant paid the rent on the first of every month.' },

  // Medium
  { id: 'ambidextrous', term: 'A person who can use both hands with equal skill', meaning: 'Ambidextrous', difficulty: 'medium', hint: '"Ambi" means both', example: 'He is ambidextrous and can write with either hand.' },
  { id: 'philanthropist', term: 'A person who works for the welfare of others, especially through donations', meaning: 'Philanthropist', difficulty: 'medium', hint: 'Think of a generous donor', example: 'The philanthropist donated millions to charity.' },
  { id: 'misanthrope', term: 'A person who hates or distrusts humankind', meaning: 'Misanthrope', difficulty: 'medium', hint: 'Opposite of a philanthropist', example: 'The old misanthrope avoided all social gatherings.' },
  { id: 'chronology', term: 'The arrangement of events in the order of their occurrence', meaning: 'Chronology', difficulty: 'medium', hint: 'Think of a timeline', example: 'The book presents events in chronology.' },
  { id: 'synonym', term: 'A word having the same meaning as another', meaning: 'Synonym', difficulty: 'medium', hint: 'Think of a word that means the same', example: '"Happy" and "joyful" are synonyms.' },
  { id: 'antonym', term: 'A word opposite in meaning to another', meaning: 'Antonym', difficulty: 'medium', hint: 'Think of an opposite word', example: '"Hot" and "cold" are antonyms.' },
  { id: 'nomad', term: 'A person who moves from place to place without a permanent home', meaning: 'Nomad', difficulty: 'medium', hint: 'Think of a wanderer', example: 'The nomad traveled across the desert with his herd.' },
  { id: 'egoist', term: 'A person who is excessively concerned with themselves', meaning: 'Egoist', difficulty: 'medium', hint: 'Think of self-centeredness', example: 'The egoist only talked about his own achievements.' },
  { id: 'altruist', term: 'A person who is selflessly concerned for the well-being of others', meaning: 'Altruist', difficulty: 'medium', hint: 'Opposite of egoist', example: 'The altruist volunteered every weekend at the shelter.' },
  { id: 'recluse', term: 'A person who lives in seclusion, avoiding others', meaning: 'Recluse', difficulty: 'medium', hint: 'Think of a hermit', example: 'After the incident, he became a recluse.' },
  { id: 'connoisseur', term: 'A person with expert knowledge in a particular field, especially arts or food', meaning: 'Connoisseur', difficulty: 'medium', hint: 'Think of an expert judge of quality', example: 'He is a connoisseur of fine wine.' },
  { id: 'plagiarist', term: "A person who copies another's work and presents it as their own", meaning: 'Plagiarist', difficulty: 'medium', hint: 'Think of someone who steals written work', example: 'The plagiarist was expelled for copying the essay.' },
  { id: 'vegetarian', term: 'A person who does not eat meat', meaning: 'Vegetarian', difficulty: 'medium', hint: 'Think of a plant-based diet follower', example: 'She has been a vegetarian since childhood.' },
  { id: 'teetotaler', term: 'A person who never drinks alcohol', meaning: 'Teetotaler', difficulty: 'medium', hint: 'Think of someone who avoids alcohol entirely', example: 'He has been a teetotaler all his life.' },
  { id: 'somnambulist', term: 'A person who walks in their sleep', meaning: 'Somnambulist', difficulty: 'medium', hint: 'Think of sleepwalking', example: 'The somnambulist was found wandering in the garden at night.' },
  { id: 'cosmopolitan', term: 'A person who is free from national or local prejudices', meaning: 'Cosmopolitan', difficulty: 'medium', hint: 'Think of a citizen of the world', example: 'Mumbai has a cosmopolitan population.' },
  { id: 'xenophobe', term: 'A person who fears or hates foreigners', meaning: 'Xenophobe', difficulty: 'medium', hint: 'Think of fear of outsiders', example: "The politician's speech reflected xenophobe attitudes." },
  { id: 'linguist', term: 'A person skilled in many languages or the study of language', meaning: 'Linguist', difficulty: 'medium', hint: 'Think of a language expert', example: 'As a linguist, she speaks seven languages fluently.' },
  { id: 'zoologist', term: 'A person who studies animals', meaning: 'Zoologist', difficulty: 'medium', hint: 'Think of an animal scientist', example: 'The zoologist studied the behavior of wild elephants.' },
  { id: 'diplomat', term: 'A person who represents their country in dealings with other countries', meaning: 'Diplomat', difficulty: 'medium', hint: 'Think of a government representative abroad', example: 'The diplomat negotiated the trade agreement.' },

  // Hard
  { id: 'bibliomania', term: 'An extreme or obsessive passion for collecting books', meaning: 'Bibliomania', difficulty: 'hard', hint: 'An extreme form of loving books', example: 'His bibliomania filled every room with towering stacks of books.' },
  { id: 'hypochondriac', term: 'A person who is excessively anxious about their health', meaning: 'Hypochondriac', difficulty: 'hard', hint: 'Think of imagined illnesses', example: 'The hypochondriac visited the doctor every week for imaginary ailments.' },
  { id: 'megalomaniac', term: 'A person obsessed with their own power or greatness', meaning: 'Megalomaniac', difficulty: 'hard', hint: 'Think of an obsession with grandeur', example: 'The megalomaniac dictator built statues of himself everywhere.' },
  { id: 'kleptomaniac', term: 'A person with an uncontrollable urge to steal', meaning: 'Kleptomaniac', difficulty: 'hard', hint: 'Think of compulsive stealing', example: 'The kleptomaniac was caught shoplifting again.' },
  { id: 'pyromaniac', term: 'A person with an uncontrollable urge to start fires', meaning: 'Pyromaniac', difficulty: 'hard', hint: 'Think of a compulsion to set fires', example: 'The pyromaniac was arrested after setting the warehouse ablaze.' },
  { id: 'sadist', term: 'A person who takes pleasure in inflicting pain on others', meaning: 'Sadist', difficulty: 'hard', hint: "Think of enjoying others' suffering", example: 'The sadist enjoyed tormenting his classmates.' },
  { id: 'masochist', term: 'A person who takes pleasure in their own pain or suffering', meaning: 'Masochist', difficulty: 'hard', hint: 'Opposite of sadist', example: 'Only a masochist would enjoy running in this heat.' },
  { id: 'charlatan', term: 'A person who falsely claims to have special knowledge or skill', meaning: 'Charlatan', difficulty: 'hard', hint: 'Think of a fraudulent expert', example: 'The charlatan sold fake medicines as miracle cures.' },
  { id: 'demagogue', term: 'A political leader who seeks support by appealing to popular desires and prejudices', meaning: 'Demagogue', difficulty: 'hard', hint: 'Think of a manipulative populist leader', example: 'The demagogue stirred up the crowd with empty promises.' },
  { id: 'reactionary', term: 'A person who opposes political or social progress and reform', meaning: 'Reactionary', difficulty: 'hard', hint: 'Think of resisting change', example: 'The reactionary politician blocked every reform bill.' },
  { id: 'vagabond', term: 'A person who wanders from place to place without a home or job', meaning: 'Vagabond', difficulty: 'hard', hint: 'Think of a homeless wanderer', example: 'The vagabond slept under bridges and begged for food.' },
  { id: 'neologism', term: 'A newly coined word or expression', meaning: 'Neologism', difficulty: 'hard', hint: 'Think of a brand-new word', example: '"Selfie" was once considered a neologism.' },
  { id: 'epicure', term: 'A person who takes particular pleasure in fine food and drink', meaning: 'Epicure', difficulty: 'hard', hint: 'Think of someone with refined taste in food', example: 'The epicure only dined at the finest restaurants.' },
  { id: 'ascetic', term: 'A person who practices severe self-discipline and abstains from worldly pleasures', meaning: 'Ascetic', difficulty: 'hard', hint: 'Think of a monk-like lifestyle', example: 'The ascetic lived in the forest with no possessions.' },
  { id: 'zealot', term: 'A person who is fanatically committed to a cause', meaning: 'Zealot', difficulty: 'hard', hint: 'Think of extreme devotion to a cause', example: 'The zealot refused to consider any opposing viewpoint.' },
  { id: 'polyglot', term: 'A person who knows and can use several languages', meaning: 'Polyglot', difficulty: 'hard', hint: 'Think of someone fluent in many languages', example: 'The polyglot could converse in eight different languages.' },
  { id: 'necromancer', term: 'A person who claims to communicate with the dead', meaning: 'Necromancer', difficulty: 'hard', hint: 'Think of someone who claims to speak with spirits', example: 'In the story, the necromancer summoned spirits from the underworld.' },
  { id: 'philatelist', term: 'A person who collects postage stamps', meaning: 'Philatelist', difficulty: 'hard', hint: 'Think of a stamp collector', example: 'As a philatelist, he owned stamps from over fifty countries.' },
  { id: 'numismatist', term: 'A person who collects or studies coins and currency', meaning: 'Numismatist', difficulty: 'hard', hint: 'Think of a coin collector', example: 'The numismatist proudly displayed his rare ancient coins.' },
  { id: 'chauvinist', term: "A person who believes in the superiority of their own group", meaning: 'Chauvinist', difficulty: 'hard', hint: "Think of extreme, biased pride in one's own group", example: 'The male chauvinist believed women were inferior at work.' },
]
