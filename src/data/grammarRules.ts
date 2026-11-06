// Rules from "120 Rules of Grammar" (Nimisha Bansal), summarised for the Grammar Rules game.
// Example sentences come from the book; titles, summaries and explanations are paraphrased.
import type { GrammarRule } from '../lib/grammarRules'

export const GRAMMAR_RULES: GrammarRule[] = [
  {
    "id": 1,
    "title": "Each vs Every",
    "category": "Pronouns",
    "summary": "Each and every both take a singular verb; every is only an adjective and is used for more than two things.",
    "explanation": "Each can act as an adjective or a pronoun and treats people or items one by one, while every treats them as part of a group. Every works only as an adjective, so it cannot stand alone before 'of my students'. Each may be used for two or more items, but every is used only for more than two; for exactly two use 'both'. Only 'every' (not 'each') goes with abstract nouns like 'reason'.",
    "pairs": [
      {
        "wrong": "Every of my students is very talented.",
        "right": "Each of my students is very talented."
      },
      {
        "wrong": "He has a book in every hand.",
        "right": "He has a book in each hand."
      },
      {
        "wrong": "They have each reason to be happy with their new home.",
        "right": "They have every reason to be happy with their new home."
      }
    ],
    "correct": [
      "Each student is very talented.",
      "Each of my students is very talented.",
      "Every student is very talented.",
      "Each person on this earth has to die one day.",
      "Every person I know has watched the movie.",
      "He has a book in each hand.",
      "They have every reason to be happy with their new home."
    ]
  },
  {
    "id": 2,
    "title": "Both vs Neither (no 'both...not')",
    "category": "Conjunctions",
    "summary": "'Both' and 'not' cannot be used together; use 'neither...nor' to say two or more things are not true.",
    "explanation": "When you want to say that something is untrue of two people or things, do not combine 'both' with 'not'. Use 'neither...nor' instead. 'Neither' makes a negative statement about two things at once and goes before singular countable nouns; it means 'not either' when relating to two things.",
    "pairs": [
      {
        "wrong": "Both Ram and Shyam are not going to visit this place.",
        "right": "Neither Ram nor Shyam is going to visit this place."
      },
      {
        "wrong": "This is a war which both sides cannot win.",
        "right": "This is a war which neither side can win."
      }
    ],
    "correct": []
  },
  {
    "id": 3,
    "title": "Who, Whom, Which and That",
    "category": "Pronouns",
    "summary": "Use who/whom for people, which for animals and things, and that for anything; 'that' is mandatory after words like same, only, all, any.",
    "explanation": "'Who' and 'whom' refer to people and to named or domesticated animals; 'which' refers to animals in general and to non-living things; 'that' has no restriction. After all, any, only, the same, none, much, no, little, few, something, anything, nothing and superlative degrees, only 'that' can be used, never 'who' or 'which'. 'Whoever' is a subject (He wins) and 'whomever' is an object (You choose him); 'whoever' also works as a subject complement after linking verbs like is, are, will be.",
    "pairs": [
      {
        "wrong": "This is the same book which you were reading.",
        "right": "This is the same book that you were reading."
      },
      {
        "wrong": "He spent up the little amount which he had.",
        "right": "He spent up the little amount that he had."
      }
    ],
    "correct": [
      "The witnesses whom I interviewed gave conflicting evidence.",
      "The people who just boarded the plane are in a rock band.",
      "The vacuum scared our dog Rocky, who was sleeping on the rug.",
      "Vinita visited the park with a dog, which likes to chase squirrels.",
      "The bomb, which killed 15 people, was the worst of a series of terrorist outrages.",
      "The car that Jasprit bought runs on electricity and gas.",
      "This is the best that I can do for you.",
      "Whoever is hungry can have the leftover pizza.",
      "Please invite whomever you choose."
    ]
  },
  {
    "id": 4,
    "title": "Types of Conditional Sentences",
    "category": "Conditionals",
    "summary": "There are three conditional types, each pairing a specific if-clause tense with a matching main-clause form.",
    "explanation": "Type I is a possible condition: simple present in the if-clause, will/shall/can/may/must plus base verb in the main clause. Type II is a condition possible only in theory: simple past in the if-clause, would/could/might/should plus base verb. Type III is an impossible (too late) condition: past perfect in the if-clause, would/could/might/should plus have plus past participle. Note: the sequence does not apply to universal truths, which take the simple present in both clauses.",
    "pairs": [],
    "correct": [
      "If I study, I will pass the exam. [Type I]",
      "If I studied, I would pass the exam. [Type II]",
      "If I had studied, I would have passed the exam. [Type III]",
      "If your files are in order you may/can leave at once.",
      "If you want to lose weight you must eat less fat diet.",
      "If I lived near my metro station I would be in time for work.",
      "If I were you, I would plant some saplings around the house.",
      "If we had found him earlier, we could have arrested him and saved the crime.",
      "If water reaches 100-degree Celsius, it boils. [Universal truth]"
    ]
  },
  {
    "id": 5,
    "title": "One of the + Plural Noun",
    "category": "Subject-Verb Agreement",
    "summary": "After 'one of the', use a plural noun; the verb is singular unless a relative pronoun refers to the plural noun.",
    "explanation": "'One of the' is followed by a plural noun. If no who/that/which follows, 'one' is the subject and the verb is singular. If a relative pronoun (who, that, which) follows, it refers back to the plural noun and takes a plural verb. For 'the only one of the + plural noun + who/that', the verb is singular.",
    "pairs": [],
    "correct": [
      "There are many birds on the tree. One of the birds is red.",
      "That is one of the birds that fly over my house at night.",
      "She is one of the mothers who are really working hard to make both ends meet.",
      "Rina is the only one of the girls who has ever been to India.",
      "This is the only one of the novels which is interesting."
    ]
  },
  {
    "id": 6,
    "title": "Number + Unit + Noun",
    "category": "Nouns & Articles",
    "summary": "In a number-unit-noun or number-unit-adjective combination, the unit stays singular; arbitrary units like handful take -s in the plural.",
    "explanation": "When a number and a unit are joined to describe a noun, the unit is singular (a ten-inch snake). A singular unit is used if the sentence is not self-explanatory, and a plural unit when it is clear without it (five dozen vs. five rupees). When there is more than one unit, they run in ascending order. Arbitrary measuring units like handful, glassful, fistful, spoonful, mouthful and cupful add -s for the plural.",
    "pairs": [],
    "correct": [
      "He saw a ten-inch snake.",
      "She gave me two five hundred-rupee notes.",
      "He had five dozen.",
      "I have five rupees.",
      "Thousands of lakhs of students took the test.",
      "He pulled out a handful of coins from his pocket.",
      "I use two handfuls of pasta per person.",
      "She drank two whole glassfuls of orange juice."
    ]
  },
  {
    "id": 7,
    "title": "Time, Money and Distance Expressions",
    "category": "Subject-Verb Agreement",
    "summary": "Expressions of time, money, weight and distance take a singular verb when seen as one unit and a plural verb when split.",
    "explanation": "When a measure of time, money, speed, weight, height or distance is treated as a single whole, use a singular verb. If it is covered or spent in several different ways, treat it as plural. So 'Ten miles needs to be covered' on foot alone, but 'Ten miles need to be covered' partly by car and partly on foot.",
    "pairs": [],
    "correct": [
      "Ten miles needs to be covered completely on foot.",
      "Ten miles need to be covered partly by car and rest on foot.",
      "Five thousand rupees is his salary.",
      "Five thousand rupees were spent on food and entertainment.",
      "Six weeks is not long enough.",
      "Five kilograms is his weight."
    ]
  },
  {
    "id": 8,
    "title": "Comparisons: 'any other' vs 'all'",
    "category": "Adjectives & Adverbs",
    "summary": "Compare a member of a group with 'any other' members, and a non-member with 'all' of the group.",
    "explanation": "When the thing compared belongs to the group, it must be compared with 'any other' members, otherwise it would be compared with itself (Gold is more precious than all metals is illogical, since gold is a metal). If the thing compared is outside the group, 'all' is fine. Kalidasa is compared with 'all English poets' because he is not English, but 'all poets' wrongly includes Kalidasa.",
    "pairs": [
      {
        "wrong": "Gold is more precious than all metals.",
        "right": "Gold is more precious than any other metals."
      },
      {
        "wrong": "Kalidasa was more famous than all poets.",
        "right": "Kalidasa was more famous than all English poets."
      }
    ],
    "correct": [
      "Diamond is more precious than all metals.",
      "Kalidasa was more famous than all English poets."
    ]
  },
  {
    "id": 9,
    "title": "For vs Since",
    "category": "Prepositions",
    "summary": "'For' marks a period of time and 'since' marks a starting point; both go with perfect tenses, and 'since' takes simple past.",
    "explanation": "'For' states duration (6 months, two years) and need not be exact; 'since' names the point from which something began (last Tuesday, 2008, 8 a.m.). Only the perfect or perfect continuous tense is used before 'for' and 'since' when they denote time. The clause after 'since' is always in the simple past.",
    "pairs": [
      {
        "wrong": "I had been waiting for him since the time I had completed my graduation.",
        "right": "I had been waiting for him since the time I completed my graduation."
      }
    ],
    "correct": [
      "He has been here for 6 months and still cannot speak a word of German.",
      "I've only known her since the beginning of last week.",
      "He has been learning English since childhood.",
      "It has been raining since 8 a.m.",
      "I have had this watch since 1965."
    ]
  },
  {
    "id": 10,
    "title": "Past Perfect and Simple Past Sequence",
    "category": "Verbs & Tenses",
    "summary": "Use past perfect for the earlier of two past actions and simple past for the later one.",
    "explanation": "When two past events are described together, the one that happened first takes the past perfect (had + V3) and the one that happened later takes the simple past. Reversing them makes the sequence wrong.",
    "pairs": [
      {
        "wrong": "He had finished the work after we had met him.",
        "right": "He finished the work after we had met him."
      },
      {
        "wrong": "The patient died before the doctor arrived.",
        "right": "The patient had died before the doctor arrived."
      }
    ],
    "correct": [
      "I finished the book after I had returned from college."
    ]
  },
  {
    "id": 11,
    "title": "Possessive Adjective before a Gerund",
    "category": "Pronouns",
    "summary": "Use a possessive adjective (my, his, their) rather than an objective pronoun before a gerund.",
    "explanation": "A gerund (verb + ing used as a noun) is preceded by a possessive adjective like my, our, his, her, their, your, not by an objective form such as me. In 'I hope you don't mind my borrowing your car', 'borrowing' acts as a noun and 'my' belongs to it, so the focus is on the action.",
    "pairs": [
      {
        "wrong": "I hope you don't mind me borrowing your car.",
        "right": "I hope you don't mind my borrowing your car."
      }
    ],
    "correct": [
      "I know his reading every night has helped him pass the test.",
      "I hope you don't mind my staying with you next week.",
      "My father doesn't like my going outside with Ram."
    ]
  },
  {
    "id": 12,
    "title": "Law of Inversion",
    "category": "Sentence Structure",
    "summary": "When a sentence begins with certain adverbs, the helping verb comes before the subject; 'no sooner' pairs with 'than'.",
    "explanation": "Inversion puts the verb before the subject for emphasis. Normal order is subject + helping verb + main verb; inverted order starts with an adverb, then a helping verb, then the subject. Partial inversion is when the adverb is followed by a helping verb; complete inversion is when the adverb is followed by a main verb (Here comes the King). 'No sooner' is followed by 'than', never 'when'. After a negative like 'Neither' starting a second part, the helping verb also comes before the subject.",
    "pairs": [
      {
        "wrong": "No sooner had I entered the class when it began to rain.",
        "right": "No sooner had I entered the class than it began to rain."
      },
      {
        "wrong": "He never goes to the temple. Neither she does.",
        "right": "He never goes to the temple. Neither does she."
      }
    ],
    "correct": [
      "My students are working very hard. [Normal sentence]",
      "Never have I seen such a beautiful place.",
      "Rarely did he go there.",
      "Seldom have I seen such a beautiful view.",
      "Here comes the King!",
      "There goes all our money!"
    ]
  },
  {
    "id": 13,
    "title": "Articles with Places (school, church, jail)",
    "category": "Nouns & Articles",
    "summary": "Do not use 'the' before places like school or jail when used for their primary purpose; use 'the' for a secondary purpose.",
    "explanation": "For common places such as school, college, church, bed, table, hospital, market, prison, jail, court, temple, mosque and university, omit 'the' when the place is used for its main purpose (learning, worship, imprisonment). Use 'the' when you visit for any other reason, for example going to the temple for something other than worship.",
    "pairs": [
      {
        "wrong": "We go to the church on Fridays.",
        "right": "We go to church on Fridays."
      },
      {
        "wrong": "The politician was sent to the jail.",
        "right": "The politician was sent to jail."
      }
    ],
    "correct": [
      "Children go to school every day. [Primary purpose]",
      "He goes to temple. [It means he goes there to worship]",
      "He goes to the temple. [It means he goes there to do any work other than worship]",
      "His home is just beside the temple. [Secondary purpose]"
    ]
  },
  {
    "id": 14,
    "title": "Hardly, Scarcely, No sooner at Sentence Start",
    "category": "Sentence Structure",
    "summary": "When 'no sooner', 'hardly' or 'scarcely' begin a sentence, they are followed by a helping verb; hardly/scarcely take 'when', no sooner takes 'than'.",
    "explanation": "Negative adverbs like no sooner, hardly and scarcely placed at the start force the helping verb before the subject. Hardly, scarcely and barely are completed with 'when', while 'no sooner' is completed with 'than'.",
    "pairs": [],
    "correct": [
      "Hardly had I begun to speak when I was interrupted.",
      "Scarcely had we started our meal when the phone rang.",
      "No sooner had I arrived than they all started to argue."
    ]
  },
  {
    "id": 15,
    "title": "Reflexive Pronoun as Object",
    "category": "Pronouns",
    "summary": "Verbs like enjoy, avail, absent, pride, adjust, acquit take a reflexive pronoun when no other object follows.",
    "explanation": "The object of a sentence receives the verb's action and answers 'whom' or 'what'. Verbs such as enjoy, avail, absent, pride, adjust, reconcile, acquit, amuse, resign, avenge, exert, apply and adapt need an object. When no other object is given, a reflexive pronoun (himself, herself) fills that role. If another object already follows (enjoyed the picture), no reflexive is added. Note: verbs like keep, stop, turn, qualify, bathe, move, rest and hide do not take reflexive pronouns.",
    "pairs": [
      {
        "wrong": "He hid himself in the room.",
        "right": "He hid in the room."
      },
      {
        "wrong": "She has qualified herself for the post.",
        "right": "She has qualified for the post."
      }
    ],
    "correct": [
      "He enjoyed himself at the party.",
      "She availed herself of the opportunity and thus got a promotion.",
      "They enjoyed the picture last evening.",
      "The former IPS officer acquitted himself effectively.",
      "He absented himself from the class."
    ]
  },
  {
    "id": 16,
    "title": "Verbs That Never Take a Reflexive Pronoun",
    "category": "Pronouns",
    "summary": "Verbs such as hide, keep, stop, shave and bathe are not followed by a reflexive pronoun.",
    "explanation": "Certain verbs, including hide, keep, stop, shave and bathe, do not take a reflexive pronoun as object. So 'hid himself' is wrong; just use 'hid'.",
    "pairs": [
      {
        "wrong": "He hid himself in the cave and thus saved his life.",
        "right": "He hid in the cave and thus saved his life."
      }
    ],
    "correct": [
      "He hid in the room."
    ]
  },
  {
    "id": 17,
    "title": "As well as and Similar Connectors",
    "category": "Subject-Verb Agreement",
    "summary": "With 'as well as', 'along with', 'together with' and similar words, the verb agrees with the first subject.",
    "explanation": "When two subjects are linked by as well as, together with, along with, and not, in addition to, like, unlike, with, rather than, except, no less than, nothing but or more than one, the verb agrees with the first subject only. The same holds for governed by, accompanied by, but, besides, led by and run by.",
    "pairs": [
      {
        "wrong": "The club members, along with his owner, was arrested.",
        "right": "The club members, along with his owner, were arrested."
      },
      {
        "wrong": "He, and not his friends, are found guilty.",
        "right": "He, and not his friends, is found guilty."
      }
    ],
    "correct": [
      "John, as well as Mary, wants to drop the course.",
      "Ram, as well as his friends, keeps asking me many questions.",
      "The publisher, as well as the writers, has come.",
      "California, along with Florida, is among the most popular US tourist destinations.",
      "The teachers, along with the Principal, are entering the class."
    ]
  },
  {
    "id": 18,
    "title": "Noun vs Verb Spellings (advice/advise etc.)",
    "category": "Redundancy & Word Usage",
    "summary": "Words like advice/advise, practice/practise and belief/believe differ in form according to whether they are nouns or verbs.",
    "explanation": "Advice, practice and belief are nouns, while advise, practise and believe are verbs. To tell which is needed, look for the answer to 'what', 'who' or 'whom', which identifies the noun in the sentence.",
    "pairs": [],
    "correct": [
      "I advise you to practise a lot since practice makes a man perfect.",
      "I'm quite good at tennis but I need to practise my serve.",
      "He gave me a piece of advice.",
      "It is my belief that my students are very talented.",
      "I believe my students."
    ]
  },
  {
    "id": 19,
    "title": "Cases of Pronouns in Comparisons",
    "category": "Pronouns",
    "summary": "In a comparison, match like with like: subjective case with subjective, objective with objective.",
    "explanation": "Personal pronouns have subjective (I, we, you, she, he, it, they), objective (me, us, you, her, him, it, them), possessive adjective (my, our, your, her, his, its, their) and possessive pronoun (mine, ours, yours, hers, his, theirs) forms. After 'than' complete the sentence mentally: 'than he does' needs 'he', 'than I' needs the subjective form. Where there is no object, an objective pronoun cannot be used.",
    "pairs": [
      {
        "wrong": "She is taller than me.",
        "right": "She is taller than I."
      },
      {
        "wrong": "She likes chocolates more than me.",
        "right": "She likes chocolates more than I."
      }
    ],
    "correct": [
      "My parents scold me more than he.",
      "My parents scold me more than him.",
      "He is as tall as I.",
      "He speaks more frequently than she."
    ]
  },
  {
    "id": 20,
    "title": "Who vs Whom",
    "category": "Pronouns",
    "summary": "Use 'who' as a subject and 'whom' as an object; test by substituting he/him or she/her.",
    "explanation": "'Who' works as the subject of a verb while 'whom' works as an object. To decide, replace the word with he/she (then use who) or him/her (then use whom). In a clause such as 'who they thought might win', the whole clause is the object of the preposition, so 'who' is correct because 'he might win' fits.",
    "pairs": [
      {
        "wrong": "The delegates differed as to whom they thought might win.",
        "right": "The delegates differed as to who they thought might win."
      }
    ],
    "correct": [
      "Mrs. Dixit consulted an astrologer whom she met in Sonpur.",
      "Jack is the man whom I went fishing with last spring.",
      "Jyoti is the girl who got the job.",
      "Whom can we turn to in a time of crisis?",
      "She is one of the professors who I think is a mathematician.",
      "He is the man whom everyone admires.",
      "She met the people who they say are helping all aspirants.",
      "They hired the man whom we interviewed last week."
    ]
  },
  {
    "id": 21,
    "title": "Words That Cannot Take a Possessive Adjective",
    "category": "Pronouns",
    "summary": "Words like separation, favour, mention, sight, pardon and report are not preceded by a possessive adjective; use 'of/from + pronoun'.",
    "explanation": "Certain words such as separation, excuse, mention, favour, pardon, leave, report and sight do not accept a possessive adjective (your, his, her, my, their, its). Rewrite the sentence with a prepositional phrase using the objective pronoun, which keeps the meaning and fixes the grammar.",
    "pairs": [
      {
        "wrong": "Your separation pains me a lot and I become sad.",
        "right": "Separation from you pains me a lot and I become sad."
      },
      {
        "wrong": "I want your favour, will you please help me?",
        "right": "I want a favour from you, will you please help me?"
      },
      {
        "wrong": "His mention in the story received great applause from the audience.",
        "right": "The mention of him in the story received great applause from the audience."
      },
      {
        "wrong": "At his sight the robbers fled.",
        "right": "At the sight of him, the robbers fled."
      }
    ],
    "correct": []
  },
  {
    "id": 22,
    "title": "Each other vs One another (and Other vs Another)",
    "category": "Pronouns",
    "summary": "Use 'each other' for two people and 'one another' for more than two.",
    "explanation": "Both phrases show that every member of a group does something to the others; 'each other' is generally for two people and 'one another' for more than two. NOTE: 'other' is an adjective meaning different or the second of two, and can also be a pronoun (others). 'An' plus 'other' is written as one word, another, meaning one more or an alternative, and it may precede a plural noun after a number or words like a couple of, few.",
    "pairs": [
      {
        "wrong": "All citizens should love each other.",
        "right": "All citizens should love one another."
      }
    ],
    "correct": [
      "Peter and Mary helped each other.",
      "We sent one another Christmas cards.",
      "Some children learn quickly but other children need more time.",
      "Have you got any other questions?",
      "Only half of the guests have arrived. Where are the others?",
      "This cake is delicious. Could I have another slice please?",
      "The investigation will take another two weeks.",
      "This place isn't great. Is there another place we could go to?"
    ]
  },
  {
    "id": 23,
    "title": "Seldom or never / Little or nothing",
    "category": "Sentence Structure",
    "summary": "Use 'seldom, if ever' and 'little, if anything', never 'seldom or ever'; sentences starting with seldom use inversion.",
    "explanation": "'Seldom' is an adverb, so a sentence beginning with it follows the law of inversion. We may say 'Seldom or never' or 'Seldom, if ever', but not 'Seldom or ever'. Likewise the phrase is 'Little or nothing' or 'Little, if anything', but not 'Little or anything'.",
    "pairs": [
      {
        "wrong": "Seldom or never he comes to my house.",
        "right": "Seldom, if ever, does he come to my house."
      },
      {
        "wrong": "Seldom or ever he comes to my house.",
        "right": "Seldom or never does he come to my house."
      },
      {
        "wrong": "I can find little or anything on this table.",
        "right": "I can find little or nothing on this table."
      }
    ],
    "correct": [
      "I can find little, if anything on this table."
    ]
  },
  {
    "id": 24,
    "title": "Very vs Much with Superlatives",
    "category": "Adjectives & Adverbs",
    "summary": "Use 'the very' before a superlative and 'much the' with a superlative; 'much' goes with comparatives and past participles.",
    "explanation": "With the superlative degree, 'very' is placed after 'the' (the very best). When 'much' is used with a superlative the article comes first as 'much the best'. 'Very' modifies present participles used as adjectives and adjectives or adverbs in the positive degree, while 'much' goes with comparatives and past participles.",
    "pairs": [
      {
        "wrong": "He is the much best student of my class.",
        "right": "He is the very best student of my class."
      },
      {
        "wrong": "He is very the best student of my class.",
        "right": "He is the very best student of my class."
      }
    ],
    "correct": [
      "It is a very interesting novel.",
      "He is much the best student of my class.",
      "He is much interested.",
      "He is much smarter.",
      "I was very exhausted after the match."
    ]
  },
  {
    "id": 25,
    "title": "Use of Enough",
    "category": "Adjectives & Adverbs",
    "summary": "'Enough' goes before a noun when it is an adjective and after the adjective or adverb when it is an adverb.",
    "explanation": "Enough works as both adjective and adverb. As an adjective it comes before the noun or pronoun (enough sugar). As an adverb it is placed after the adjective or adverb it qualifies (smart enough, big enough).",
    "pairs": [],
    "correct": [
      "He has enough sugar.",
      "She is smart enough.",
      "You are not big enough for basketball.",
      "Test reports indicate that it develops enough power for the job and is flexible.",
      "A landing between the ground and first floors is ample enough to be used as a study."
    ]
  },
  {
    "id": 26,
    "title": "The Adverb 'as' with Certain Verbs",
    "category": "Redundancy & Word Usage",
    "summary": "Verbs like treat, define, regard, describe take 'as' before the complement; elect, name, think, call, consider, make, choose, appoint do not.",
    "explanation": "The word 'as' is used with verbs such as treat, define, regard, describe, respect, depict, portray, view and know. It is not used with elect, name, think, consider, call, make, choose and appoint, which take their complement directly.",
    "pairs": [],
    "correct": [
      "Biology is defined as the science of living beings.",
      "He is regarded as a God in India.",
      "She described Gary as shy.",
      "His latest film is described as a 'romantic comedy'.",
      "She is treated as a child.",
      "She was elected Chair of the Board of Governors.",
      "He has just been appointed director of the publishing division.",
      "He thinks her a fool.",
      "The teacher called him stupid."
    ]
  },
  {
    "id": 27,
    "title": "Although with Yet / But",
    "category": "Conjunctions",
    "summary": "'Although' is followed in the main clause by optional 'yet' but never by 'but'.",
    "explanation": "Although means 'in spite of something' and introduces a subordinate clause that needs a main clause to complete it. The main clause may optionally begin with 'yet', but a subordinate 'although' clause never takes 'but' in the main clause.",
    "pairs": [
      {
        "wrong": "Although she is rich, but she thinks twice before spending a penny.",
        "right": "Although she is rich, she thinks twice before spending a penny."
      }
    ],
    "correct": [
      "Although she is rich, she thinks twice before spending a penny.",
      "Although she is rich, yet she thinks twice before spending a penny."
    ]
  },
  {
    "id": 28,
    "title": "Verbs Not Used in the -ing Form",
    "category": "Verbs & Tenses",
    "summary": "Stative verbs of possession, perception and feeling (own, see, love, taste, smell etc.) are not used in continuous tenses.",
    "explanation": "Verbs of possession (own, belong, have, include, possess, owe, contain, consist), perception (see, smell, taste, hear, feel, appear, seem, resemble, notice) and feeling or thought (love, know, think, hate, want, need, desire, wish, like) do not exist in the -ing form. NOTE: 'loving' may appear as an adjective (a loving person). 'Have' in the sense of possession cannot take -ing, but 'having' is fine in other senses (having lunch) or as a perfect participle (Having done the work, he went to play).",
    "pairs": [
      {
        "wrong": "I am owning a car.",
        "right": "I own a car."
      },
      {
        "wrong": "I am loving it.",
        "right": "I love it."
      },
      {
        "wrong": "This sauce is tasting strange.",
        "right": "This sauce tastes strange."
      },
      {
        "wrong": "This perfume is smelling like roses.",
        "right": "This perfume smells like roses."
      },
      {
        "wrong": "She has always been hating jazz.",
        "right": "She has always hated jazz."
      },
      {
        "wrong": "All the luggage is belonging to me.",
        "right": "All the luggage belongs to me."
      },
      {
        "wrong": "I am having a book.",
        "right": "I have a book."
      }
    ],
    "correct": [
      "He is a very loving person.",
      "He described his work in loving detail.",
      "I am having lunch now.",
      "Having done the work, he went to play."
    ]
  },
  {
    "id": 29,
    "title": "Words that need the Perfect Tense",
    "category": "Verbs & Tenses",
    "summary": "Words like ever, never, yet, already, just now, until, so far and up to now usually go with perfect tenses.",
    "explanation": "Certain time words signal the perfect tense: ever, never, yet, already, now, just, until, always, occasionally, often, lately, recently, so far, up to now. Use present perfect or past perfect with them rather than simple past. For example, 'already' pairs with has/have/had plus the past participle, and 'up to now' needs a perfect form.",
    "pairs": [
      {
        "wrong": "He went there already.",
        "right": "He had gone there already."
      },
      {
        "wrong": "Aman completed his work up to now.",
        "right": "Aman has not completed his work up to now."
      },
      {
        "wrong": "The train already left.",
        "right": "The train has already left."
      }
    ],
    "correct": [
      "The concert had already begun by the time we arrived.",
      "I went to Paris last summer. Have you ever been there?",
      "I have not spoken to her yet.",
      "He has gone just now."
    ]
  },
  {
    "id": 30,
    "title": "Collective Nouns and Verb Agreement",
    "category": "Subject-Verb Agreement",
    "summary": "A collective noun takes a singular verb when the group acts as one unit, and a plural verb when members act separately.",
    "explanation": "When the whole group does the same thing together, the collective noun (audience, army, jury) takes a singular verb. When the members are doing different things, use a plural verb. NOTE: words such as police, vermin, cattle, clergy, gentry, poultry, people, folk, peasantry, infantry and cavalry are plural nouns, not collective nouns, so they always take plural verbs. 'People' meaning a nation takes a singular verb, and 'peoples' means different nationalities.",
    "pairs": [],
    "correct": [
      "The audience is watching the movie.",
      "The army is marching towards the Himalayas.",
      "The jury is taking a decision.",
      "The audience are taking the seats.",
      "The army are changing their dresses.",
      "The jury are divided in their opinion.",
      "The police are investigating the case.",
      "Cattle are wandering in the farm."
    ]
  },
  {
    "id": 31,
    "title": "Words followed by 'to'",
    "category": "Prepositions",
    "summary": "Prefer, injurious, addicted, known, superior, junior, senior, ulterior, inferior, ancillary, exterior and posterior are followed by the preposition 'to'.",
    "explanation": "A set of words always takes 'to': prefer, injurious, addicted, known, superior, junior, senior, ulterior, inferior, ancillary, exterior, posterior. NOTE: words ending in '-ior' take 'to'. Also, 'marry' and 'known' are followed by 'to' in the passive voice, so 'Rama is married to Sita' and 'I am known to him' are correct, while 'known by him' is wrong here.",
    "pairs": [],
    "correct": [
      "For babies, breastfeeding is superior to bottle-feeding.",
      "Too much alcohol is injurious to your health.",
      "Would you prefer to pay by cash, cheque, or credit card?",
      "They promoted a man who was junior to me and made him my boss.",
      "Paragraph 19 was merely ancillary to paragraph 16.",
      "I prefer tea to coffee.",
      "Rama is married to Sita.",
      "I am known to him."
    ]
  },
  {
    "id": 32,
    "title": "as ... as and so ... as",
    "category": "Adjectives & Adverbs",
    "summary": "Use 'as ... as' in positive and negative sentences, but 'so ... as' only in negative sentences, with the positive degree between.",
    "explanation": "The blanks in 'as ... as' and 'so ... as' are filled with the positive degree of an adjective. 'As ... as' works in both positive and negative sentences, while 'so ... as' can be used only to express negation.",
    "pairs": [
      {
        "wrong": "He is so good as Ram.",
        "right": "He is as good as Ram."
      }
    ],
    "correct": [
      "If we pass on the information, he's as good as dead.",
      "I'm not so desperate as to agree to that.",
      "He is as good as Ram.",
      "He is not as good as Ram.",
      "He is not so good as Ram."
    ]
  },
  {
    "id": 33,
    "title": "'Times' with comparisons",
    "category": "Adjectives & Adverbs",
    "summary": "After 'times' never use a comparative degree; use 'times as + positive + as' instead.",
    "explanation": "When a comparison includes the word 'times', the comparative degree (larger, heavier) cannot follow it. Rewrite as 'three times as large as'. When 'times' is not written (twice cheaper, twice costlier), the comparative can be used. 'Two times as costly as that' is also correct.",
    "pairs": [
      {
        "wrong": "This book is three times larger than that book.",
        "right": "This book is three times as large as that book."
      },
      {
        "wrong": "This book is three times heavier than that book.",
        "right": "This book is three times as heavy as that book."
      }
    ],
    "correct": [
      "It is twice cheaper than that.",
      "It is twice costlier than that.",
      "It is two times as costly as that."
    ]
  },
  {
    "id": 34,
    "title": "Narration: Indirect speech word order",
    "category": "Sentence Structure",
    "summary": "Indirect speech is always a statement, so use subject + verb order, not question order, after the reporting clause.",
    "explanation": "A statement runs Subject + Helping Verb + Main Verb, while a question runs Word + Helping Verb + Subject + Main Verb. In indirect speech the reported part is always a statement, whatever type of sentence the direct speech was. So the helping verb must come after the subject, not before it as in a question.",
    "pairs": [
      {
        "wrong": "He asked me where are you going.",
        "right": "He asked me where I was going."
      },
      {
        "wrong": "He asked me what was my name.",
        "right": "He asked me what my name was."
      }
    ],
    "correct": [
      "She says that she is a little bit nervous.",
      "The teacher ordered me to shut the door.",
      "We asked him if he was ill.",
      "He prayed that I might live long."
    ]
  },
  {
    "id": 35,
    "title": "Nearest Subject Rule (or/nor/either-or)",
    "category": "Subject-Verb Agreement",
    "summary": "With or, nor, neither/nor, either/or and not only/but also, the verb agrees with the nearest subject.",
    "explanation": "When two subjects are joined by or, nor, neither...nor, either...or, or not only...but also, look at the subject closest to the verb. If it is singular the verb is singular, and if it is plural the verb is plural.",
    "pairs": [],
    "correct": [
      "Either the bears or the lion has escaped from the zoo.",
      "Neither the lion nor the bears have escaped from the zoo.",
      "Not only the teachers but also the Principal is happy.",
      "Not only dogs but also cats are available at the animal shelter."
    ]
  },
  {
    "id": 36,
    "title": "Comparing two qualities of one object",
    "category": "Adjectives & Adverbs",
    "summary": "When two qualities of the same thing are compared, use 'more' with each adjective instead of the comparative -er form.",
    "explanation": "If both qualities belong to the same object, put 'more' before the first adjective and do not use the comparative degree (redder, heavier). The sentence compares the two qualities with each other, not two different things.",
    "pairs": [
      {
        "wrong": "This pen is redder than white.",
        "right": "This pen is more red than white."
      },
      {
        "wrong": "This book is heavier than larger.",
        "right": "This book is more heavy than large."
      }
    ],
    "correct": [
      "This shirt is more white than red.",
      "This umbrella is more beautiful than strong."
    ]
  },
  {
    "id": 37,
    "title": "More than one / many a / a great many",
    "category": "Subject-Verb Agreement",
    "summary": "'More than one' and 'many a' take a singular noun and verb; 'many', 'a good many' and 'a great many' take plural.",
    "explanation": "Though they suggest plurality, 'more than one' and 'many a' are followed by a singular noun and a singular verb. 'Many', 'a good many' and 'a great many' are followed by a plural noun and a plural verb. Also compare 'one student is' with 'many students are'.",
    "pairs": [],
    "correct": [
      "A great many students are waiting for the class.",
      "Many tigers are missing from the national park.",
      "More than one student is absent today.",
      "Many a student is absent today.",
      "One student is absent today.",
      "A great many students are absent today.",
      "Many students are absent today."
    ]
  },
  {
    "id": 38,
    "title": "Doubt: whether vs that",
    "category": "Conjunctions",
    "summary": "After 'doubt' or 'doubtful' use 'whether' (or 'if'), but after 'no doubt' or 'not doubtful' use 'that'.",
    "explanation": "When the sentence has 'doubt' or 'doubtful' in a positive sense, the connector is either 'if' or 'whether'. When the sentence has 'no doubt' or 'not doubtful', the connector must be 'that'.",
    "pairs": [
      {
        "wrong": "I have no doubt whether it will rain or not.",
        "right": "I have no doubt that it will rain or not."
      },
      {
        "wrong": "There is a doubt that he goes there or not.",
        "right": "There is a doubt whether he goes there or not."
      },
      {
        "wrong": "He has no doubt if Shyam is his best friend.",
        "right": "He has no doubt that Shyam is his best friend."
      }
    ],
    "correct": []
  },
  {
    "id": 39,
    "title": "Sequence of Tenses in Narration",
    "category": "Verbs & Tenses",
    "summary": "The tense of the reported clause does not shift to the past for universal truths, historical facts, proverbs and habitual facts.",
    "explanation": "Normally a past reporting verb makes the subordinate clause past (sequence of tenses). The tense stays unchanged when the reported statement is a universal truth, a historical fact, a proverb, or a habitual fact. A statement about one particular thing (the honey) is not a universal truth, so it follows the past tense.",
    "pairs": [
      {
        "wrong": "He told me that honey was sweet.",
        "right": "He told me that honey is sweet."
      },
      {
        "wrong": "He told me that the honey is sweet.",
        "right": "He told me that the honey was sweet."
      }
    ],
    "correct": [
      "The teacher said that Kalidas is the Shakespeare of India.",
      "Rohit said that where there is a will there is a way.",
      "He said that he snoozes his alarm every day."
    ]
  },
  {
    "id": 40,
    "title": "Little, a little, the little; few, a few, the few; some and any",
    "category": "Adjectives & Adverbs",
    "summary": "Little/few mean hardly any, a little/a few mean some, and the little/the few mean all that there is; 'any' is for questions and negatives, 'some' for positives.",
    "explanation": "With uncountable nouns: little = hardly any, a little = some but not much, the little = all that is available. With countable nouns: few = hardly any, a few = some but not many (positive), the few = all that there are. NOTE: 'any' is for questions and negatives while 'some' is for positive sentences, and both can be used with countable and uncountable nouns. 'Some' appears in questions when the expected answer is yes (offers, requests).",
    "pairs": [],
    "correct": [
      "I cannot make tea since there is little milk.",
      "A little knowledge is dangerous.",
      "He utilised the little water that was available.",
      "Few members attended the meeting.",
      "There were a few members present.",
      "He lost the few friends he had.",
      "Do we need any rice?",
      "We have some rice in the cupboard."
    ]
  },
  {
    "id": 41,
    "title": "Objective case after prepositions",
    "category": "Pronouns",
    "summary": "A pronoun after a preposition (including 'but' and 'except' used as prepositions) or a verb must be in the objective case.",
    "explanation": "Subjective pronouns (I, we, you, they, he, she, it) become objective (me, us, you, them, him, her, it) after a preposition. 'But' and 'except' act as prepositions meaning 'other than', so they take the objective case. A verb such as 'let' is also followed by an objective pronoun. 'As well as' is not a preposition, so the subjective case is correct there, whereas 'between' takes the objective case.",
    "pairs": [
      {
        "wrong": "None but he is going to the party.",
        "right": "None but him is going to the party."
      },
      {
        "wrong": "All except he liked the performance.",
        "right": "All except him liked the performance."
      }
    ],
    "correct": [
      "Let him do that work.",
      "They agreed to let us live there rent-free.",
      "Ram as well as he is going to the party.",
      "There is a good friendship between you and him."
    ]
  },
  {
    "id": 42,
    "title": "Order of Pronouns",
    "category": "Pronouns",
    "summary": "Pronouns joined by 'and' follow 231 order for positive sense and 123 order for negative sense or blame.",
    "explanation": "First person is I/we, second person is you, third person is he/she/they. When all three are subjects joined by 'and' in a positive sense, use 2-3-1 (You, he and I) with a plural verb. With two persons, use 2-3, 2-1 or 3-1. When the sense is negative (mistake, blame, guilt), use 1-2-3, or for two persons 1-2, 2-3 or 1-3. If all the pronouns are plural, use the order 1-2-3 always.",
    "pairs": [],
    "correct": [
      "You, he and I are good friends.",
      "You and she are good friends.",
      "You and I are playing chess.",
      "He and I were watching T.V.",
      "I, you and he are guilty.",
      "I, you and he are robbers.",
      "I and you have committed a crime.",
      "You and he are sinners.",
      "We, you and they are going to watch a movie."
    ]
  },
  {
    "id": 43,
    "title": "Superfluous (redundant) words",
    "category": "Redundancy & Word Usage",
    "summary": "Do not add words that repeat meaning already carried by another word in the sentence.",
    "explanation": "Superfluous means extra. Do not combine words where one already implies the other, such as previous records, wet water, retreated back, reborn again, equally as good, mutual agreement, coward man, with bag and baggage, passing marks, suddenly came across. Do not use 'not' after until/unless/forbid/prohibit/prevent/dissuade/deny/refuse/lest. Also redundant: final destination, rough estimate, rough approximation, past history, return back, coming future, reason because, consensus opinion, final conclusion, funeral service. NOTE: 'enter into' is redundant, but when it means 'investigation' (a phrasal verb) it is acceptable.",
    "pairs": [
      {
        "wrong": "India broke all previous records in today's match.",
        "right": "India broke all records in today's match."
      },
      {
        "wrong": "I want wet water.",
        "right": "I want water."
      },
      {
        "wrong": "Suppose if you won the Oscar, what would you do?",
        "right": "Suppose you won the Oscar, what would you do?"
      },
      {
        "wrong": "The army retreated back from the conflict zone in Kashmir.",
        "right": "The army retreated from the conflict zone in Kashmir."
      },
      {
        "wrong": "The sage was reborn again in Vijayanagar.",
        "right": "The sage was reborn in Vijayanagar."
      },
      {
        "wrong": "Manu and Sharma are equally as good.",
        "right": "Manu is as good as Sharma."
      },
      {
        "wrong": "The manager and the chairman decided on a mutual agreement on profit.",
        "right": "The manager and the chairman decided on an agreement on profit."
      },
      {
        "wrong": "She forbade me not to leave her alone.",
        "right": "She forbade me to leave her alone."
      }
    ],
    "correct": [
      "He is a coward.",
      "She left the house, bag and baggage.",
      "Pass marks are thirty-three.",
      "I came across him on the train."
    ]
  },
  {
    "id": 44,
    "title": "Use of the Apostrophe ('s)",
    "category": "Nouns & Articles",
    "summary": "Do not use 's with non-living things; use 'of' instead, except for time, weight, distance, place, idiom, unit, personification and heavenly bodies.",
    "explanation": "Apostrophe-s shows possession by living things. For non-living things use the 'of' form (legs of the table). NOTE: exceptions are time, weight, distance, place, idiom, unit, personification and heavenly bodies, which can take 's. The pronouns yours, ours, its, theirs, his, hers and whose are already possessive and need no apostrophe.",
    "pairs": [
      {
        "wrong": "Table's legs.",
        "right": "Legs of the table."
      },
      {
        "wrong": "Door's bolt.",
        "right": "Bolt of the door."
      },
      {
        "wrong": "Pen's ink.",
        "right": "Ink of the pen."
      },
      {
        "wrong": "Book's page.",
        "right": "Page of the book."
      },
      {
        "wrong": "Chair's legs.",
        "right": "Legs of the chair."
      }
    ],
    "correct": [
      "One week's vacation.",
      "Four dollars' worth.",
      "Today's date.",
      "The city's parks.",
      "Nature's call.",
      "At a stone's throw."
    ]
  },
  {
    "id": 45,
    "title": "Past time words need Simple Past",
    "category": "Verbs & Tenses",
    "summary": "When a specific point of past time is mentioned (yesterday, ten days ago), use the Simple Past tense, not the present perfect.",
    "explanation": "If the sentence names a definite point of time in the past, such as yesterday or 10 days ago, always use the Simple Past tense. Present perfect or other perfect forms are wrong in such sentences.",
    "pairs": [
      {
        "wrong": "I have gone to the market yesterday to purchase a car.",
        "right": "I went to the market yesterday to purchase a car."
      },
      {
        "wrong": "The company's shares have dived by 90p to 165p on the stock market last week.",
        "right": "The company's shares dived by 90p to 165p on the stock market last week."
      }
    ],
    "correct": []
  },
  {
    "id": 46,
    "title": "Absolute adjectives never take 'most'",
    "category": "Adjectives & Adverbs",
    "summary": "Absolute words such as unique, excellent, perfect, ideal, entire and complete cannot be used with 'most' or intensifiers.",
    "explanation": "Some adjectives are already at their highest degree and are never used with 'most'. These include chief, round, unique, total, whole, singular, rectangular, square, excellent, spherical, extreme, annual, golden, deaf, blind, right, empty, circular, wrong, impossible, perfect, solar, external and ideal. Use 'a/an' instead, and do not add 'completely' either.",
    "pairs": [
      {
        "wrong": "He is the most excellent student.",
        "right": "He is an excellent student."
      },
      {
        "wrong": "This is the most unique product of our company.",
        "right": "This is a unique product of our company."
      },
      {
        "wrong": "He is completely perfect.",
        "right": "He is perfect."
      }
    ],
    "correct": []
  },
  {
    "id": 47,
    "title": "'Quite' and 'all' not together",
    "category": "Redundancy & Word Usage",
    "summary": "The words 'quite' and 'all' are never used together in a sentence.",
    "explanation": "'Quite' already means completely, so adding 'all' is redundant; use one or the other. NOTE: do not confuse 'quite' with 'quiet'. 'Quiet' is a noun meaning a state of being silent, while 'quite' is an adverb meaning completely.",
    "pairs": [
      {
        "wrong": "He is quite all well.",
        "right": "He is quite well."
      },
      {
        "wrong": "He has done quite all the work.",
        "right": "He has done all the work."
      }
    ],
    "correct": []
  },
  {
    "id": 48,
    "title": "Tense with 'ago' and 'before'",
    "category": "Verbs & Tenses",
    "summary": "Use Simple Past with 'ago'; with 'before' use Past Perfect for the earlier action and Simple Past for the later one.",
    "explanation": "When 'ago' appears in the sentence, we generally use the Simple Past. With 'before', the earlier of two past actions takes the Past Perfect (had + V3) and the later action takes the Simple Past (V2).",
    "pairs": [
      {
        "wrong": "He had gone two seconds ago.",
        "right": "He went two seconds ago."
      },
      {
        "wrong": "She had submitted the work five hours ago.",
        "right": "She submitted the work five hours ago."
      },
      {
        "wrong": "The patient died before the doctor came.",
        "right": "The patient had died before the doctor came."
      }
    ],
    "correct": []
  },
  {
    "id": 49,
    "title": "Possessive sign: common and split possession",
    "category": "Nouns & Articles",
    "summary": "Joint ownership takes 's on the last noun only; separate ownership takes 's on each noun with a plural noun and verb.",
    "explanation": "For common possession (one thing shared), put the possessive sign on the last noun only: Ram and Shyam's car. A plural noun is also fine if there are several items jointly owned. For split possession (each owns separately), put the possessive sign on each noun, and the noun is plural because there are at least two items (Ram's and Shyam's cars).",
    "pairs": [
      {
        "wrong": "Ram's and Shyam's car is being decorated for Balram's marriage.",
        "right": "Ram's and Shyam's cars are being decorated for Balram's marriage."
      }
    ],
    "correct": [
      "Ram and Shyam's car is being decorated for Balram's marriage.",
      "Ram and Shyam's cars are being decorated for Balram's marriage."
    ]
  },
  {
    "id": 50,
    "title": "It's vs its",
    "category": "Pronouns",
    "summary": "'It's' means 'it is', while 'its' shows possession.",
    "explanation": "People often confuse the two forms. 'It's' is a contraction of 'it is', and 'its' is the possessive form with no apostrophe. Use 'its' before a noun that belongs to something.",
    "pairs": [
      {
        "wrong": "The child is carrying it's book.",
        "right": "The child is carrying its book."
      },
      {
        "wrong": "Its called a miracle.",
        "right": "It's called a miracle."
      }
    ],
    "correct": []
  },
  {
    "id": 51,
    "title": "A number of vs The number of",
    "category": "Subject-Verb Agreement",
    "summary": "'A number of' takes a plural noun and plural verb; 'the number of' takes a plural noun and singular verb.",
    "explanation": "The structure 'A number of + plural noun + plural verb' treats the group as many. 'The number of + plural noun + singular verb' focuses on the number itself. A similar rule applies to 'a variety of' and 'the variety of'.",
    "pairs": [],
    "correct": [
      "A number of students are waiting here.",
      "The number of students is fifty.",
      "A number of tickets were sold almost immediately.",
      "The number of employees taking legal action over work-related hazards is increasing."
    ]
  },
  {
    "id": 52,
    "title": "It is time / high time / about time",
    "category": "Verbs & Tenses",
    "summary": "After 'It is time', use 'to + V1' with no subject, or a subject followed by the past tense (V2).",
    "explanation": "With 'it is time', 'it is high time' or 'it is about time' follow one of two patterns. If no subject follows, use 'to + V1'. If a subject follows directly, use the past form V2 after it. NOTE: 'it's time + subject + past verb' refers to the present moment.",
    "pairs": [],
    "correct": [
      "It is time to work hard.",
      "It is time to ask for a raise.",
      "It is time he worked hard.",
      "Gosh! It's almost midnight. It is time we went home."
    ]
  },
  {
    "id": 53,
    "title": "Angry with / angry at",
    "category": "Prepositions",
    "summary": "Use 'angry with' for a person or living thing, and 'angry at' for something else.",
    "explanation": "When the cause of anger is a person or living being, take 'with'. When it is a thing, event or situation, take 'at'. NOTE: the same rule applies to the word 'annoy'.",
    "pairs": [],
    "correct": [
      "I got really angry with her.",
      "I am angry with Shyam because he did not go to the class.",
      "The local residents were angry at the lack of parking spaces.",
      "They are angry at the way they have been treated."
    ]
  },
  {
    "id": 54,
    "title": "'Know' followed by how/what/where",
    "category": "Verbs & Tenses",
    "summary": "'Know' is not directly followed by an infinitive 'to'; use how, when, why, where or what first.",
    "explanation": "When 'know' is used, it cannot be directly followed by 'to + verb'. Add a question word such as how, when, why or where to make the sentence grammatically feasible.",
    "pairs": [
      {
        "wrong": "I don't know to make tea.",
        "right": "I don't know how to make tea."
      }
    ],
    "correct": [
      "I do not know what all the fuss is about.",
      "I do not know how to make tea; hence you should help me out.",
      "Do you know where the Post Office is?"
    ]
  },
  {
    "id": 55,
    "title": "Else...but, other...than, rather...than",
    "category": "Conjunctions",
    "summary": "'Else' is followed by 'but', while 'other' and 'rather' are followed by 'than'.",
    "explanation": "The word 'else' pairs with 'but', as in nothing else but. The adverbs 'other' and 'rather' pair with 'than'.",
    "pairs": [],
    "correct": [
      "It is nothing else but mere foolishness.",
      "Everybody else has agreed but you.",
      "He met no other person than Ram.",
      "I think I would rather stay at home this evening than go out."
    ]
  },
  {
    "id": 56,
    "title": "Sort, type and kind take singular verbs",
    "category": "Subject-Verb Agreement",
    "summary": "The words sort, type and kind are always followed by a singular verb.",
    "explanation": "When the subject contains 'this type of', 'this sort of' or 'any kind of', the verb is singular, since the head noun is type, sort or kind.",
    "pairs": [],
    "correct": [
      "This type of article is sold in the market.",
      "This sort of camera is very expensive.",
      "Any kind of racism is abhorrent to me."
    ]
  },
  {
    "id": 57,
    "title": "In, inside and into",
    "category": "Prepositions",
    "summary": "'Inside' implies movement from outside to in, 'in' implies a static position, and 'into' implies moving toward or a change of state.",
    "explanation": "Use 'inside' when moving from outside to inside. Use 'in' when something is already inside (static). Use 'into' for coming toward or entering something, and for a change in state. NOTE: 'inside out' means that the inner part is outside and the outer part is inside, and it can also mean 'completely'.",
    "pairs": [],
    "correct": [
      "I came inside the class.",
      "He tried to get inside her mind.",
      "I know my husband inside out.",
      "She had her sweater inside out.",
      "I am in the class.",
      "The chlorine in the pool makes my eyes sore.",
      "Come into the house.",
      "He threw the letter into the fire.",
      "Can you translate this passage into German?",
      "The fruit can be made into jam."
    ]
  },
  {
    "id": 58,
    "title": "With vs by",
    "category": "Prepositions",
    "summary": "Use 'with' for non-living instruments and 'by' for living agents; use 'by' with 'watch' and with time deadlines.",
    "explanation": "We use 'with' for non-living things (pen, tissue, stick) and 'by' for living things (a man, an author, a painter). NOTE: for 'watch', always say 'by your watch'. 'By' also refers to time, as in by five o'clock.",
    "pairs": [],
    "correct": [
      "We write with a pen.",
      "She wiped her lipstick off with a tissue.",
      "He hit the dog with a stick.",
      "The motorcycle was driven by a tiny bald man.",
      "The book was translated by a well-known author.",
      "What is the time by your watch?",
      "She had promised to be back by five o'clock.",
      "I have got to be home by seven."
    ]
  },
  {
    "id": 59,
    "title": "'Start' is not used with 'from'",
    "category": "Prepositions",
    "summary": "Do not use 'from' with 'start'; use 'on' (or 'at') for the starting point, and keep 'from' for continuation.",
    "explanation": "'Start from Monday' wrongly suggests the event repeats every day after. An event can start only once, so use 'on' to show it started on Monday only. NOTE: 'from' implies continuation, so 'prepare for the exams from Monday' is correct.",
    "pairs": [
      {
        "wrong": "My exams start from Monday.",
        "right": "My exams start on Monday."
      },
      {
        "wrong": "He will start his preparation from Monday.",
        "right": "He will start his preparation on Monday."
      }
    ],
    "correct": [
      "He will prepare for the exams from Monday."
    ]
  },
  {
    "id": 60,
    "title": "'To + V1ing' (gerund after 'to')",
    "category": "Verbs & Tenses",
    "summary": "After certain expressions ending in 'to' (used to, accustomed to, look forward to, etc.) use the -ing form, not the base verb.",
    "explanation": "Normally 'to' is followed by V1, but in these expressions 'to' is a preposition and needs V1+ing: be used to, accustomed to, addicted to, with a view to, look forward to, given to, prone to, devoted to, in addition to, confess to, disposed to, come to. NOTE: when the -ing form acts as a noun it is called a gerund.",
    "pairs": [],
    "correct": [
      "She was given to staying in bed till lunchtime.",
      "These measures have been taken with a view to increasing the company's profits.",
      "I look forward to hearing from you.",
      "He is rather prone to making tactless remarks.",
      "She has devoted herself to getting justice for her son.",
      "I am not accustomed to being treated like this."
    ]
  },
  {
    "id": 61,
    "title": "A vs An (by sound)",
    "category": "Nouns & Articles",
    "summary": "Use 'an' before a vowel sound and 'a' before a consonant sound, regardless of spelling.",
    "explanation": "The choice between a and an depends on the sound of the first letter, not the spelling. Vowels are a, e, i, o, u, and the rest are consonants. Words starting with vowel letters but a 'y' or 'w' sound (university, European, one-rupee note, Union, unicorn) take 'a'.",
    "pairs": [],
    "correct": [
      "An NCC cadet.",
      "A UNICEF participating nation.",
      "An umbrella.",
      "An M. Tech. graduate.",
      "A utensil.",
      "A university.",
      "A year.",
      "A one-eyed girl.",
      "A unanimous decision."
    ]
  },
  {
    "id": 62,
    "title": "Uses of the Definite Article 'The'",
    "category": "Nouns & Articles",
    "summary": "Use 'the' before unique things, rivers, oceans, mountain ranges, newspapers, superlatives, abbreviated countries and similar groups of names.",
    "explanation": "'The' goes before mountain ranges (not single peaks), bays, island groups, canals, ships, religious books, armed forces, rivers, seas, deserts, political parties, musical instruments and unique things like the sun or moon. It is also used before newspaper names, abbreviated country names (the USA, the UK), superlatives, and the comparative pattern 'the more... the more' or 'the better of the two'. Use it too in metaphors, before common-plus-proper noun phrases (the river Nile), and before names of government organisations.",
    "pairs": [
      {
        "wrong": "The Mount Everest is the highest peak.",
        "right": "Mount Everest is the highest peak."
      }
    ],
    "correct": [
      "The Himalayas are a mountain range.",
      "The Times of India is a newspaper.",
      "The USA is a large country.",
      "The faster you walk, the sooner you reach.",
      "He is the better candidate of the two for the job.",
      "Delhi is the Paris of India.",
      "The moon is shining tonight.",
      "The earth is moving around the sun."
    ]
  },
  {
    "id": 63,
    "title": "Omission of the Article 'The'",
    "category": "Nouns & Articles",
    "summary": "No article is used before names of cities, countries, continents, streets, single lakes, peaks, single islands, languages, sports and abstract nouns used generally.",
    "explanation": "Do not put an article before names of cities, countries (not abbreviated), continents, streets, single lakes and bays, mountain peaks, single islands, languages and sports. Words like season, language, drinks, meals, God, life and money also take no article in a general sense. When such a word is particularised, 'the' is used, as in 'the breakfast I had this morning'. When 'the' precedes a language name, it refers to the people who speak it.",
    "pairs": [],
    "correct": [
      "Breakfast should be light but the breakfast I had this morning was heavy.",
      "Los Angeles is a large city.",
      "Mount Everest is the highest peak.",
      "Lake Carey is a singular lake.",
      "Cricket is a popular sport in India."
    ]
  },
  {
    "id": 64,
    "title": "The + Adjective",
    "category": "Adjectives & Adverbs",
    "summary": "'The' before an adjective turns it into a plural noun naming a whole group of people.",
    "explanation": "When 'the' is placed before an adjective, the phrase refers to the whole group, for example the poor means poor people and the rich means rich people. Such phrases are treated as plural nouns and take a plural verb.",
    "pairs": [],
    "correct": [
      "The poor are not always dishonest.",
      "The honest are respected.",
      "The needy deserve our help.",
      "The brave are admired by everyone.",
      "The rich are not always happy."
    ]
  },
  {
    "id": 65,
    "title": "Same Noun Repeated with a Preposition",
    "category": "Nouns & Articles",
    "summary": "When the same noun is repeated around a preposition, both nouns are singular.",
    "explanation": "Whenever the same noun is joined to itself by a preposition (X after X, city after city), both nouns must be in the singular form, even though the idea is plural.",
    "pairs": [
      {
        "wrong": "Villages after villages were destroyed by the terrorists.",
        "right": "Village after village were destroyed by the terrorists."
      },
      {
        "wrong": "Books after books had been read by him.",
        "right": "Book after book had been read by him."
      }
    ],
    "correct": [
      "City after city was set on fire.",
      "Page after page was reviewed multiple times."
    ]
  },
  {
    "id": 66,
    "title": "Irregular and Compound Noun Plurals",
    "category": "Nouns & Articles",
    "summary": "Learn the irregular plurals and how compound nouns form their plural, often on the main noun.",
    "explanation": "Irregular plurals include dormouse-dormice, foot-feet, goose-geese, louse-lice, man-men, mouse-mice, tooth-teeth and woman-women. In hyphenated compounds like daughter-in-law, passer-by or commander-in-chief, the first (main) word takes the plural. In others like book-case or class-fellow, the last word takes it; and in a few like man-servant or lord-justice, both words become plural (men-servants, lords-justices). Some compounds of this type, such as maidservant, can behave differently, so learn them individually.",
    "pairs": [],
    "correct": [
      "Both of my sisters-in-law live in Pune.",
      "The mice ran away from the cat.",
      "The commanders-in-chief met the president.",
      "She has pain in her teeth and feet.",
      "The passers-by stopped to look at the accident."
    ]
  },
  {
    "id": 67,
    "title": "Compound Possession; Male/Female vs Man/Woman",
    "category": "Nouns & Articles",
    "summary": "'Male' and 'female' describe a noun's characteristics, while 'man' and 'woman' show the profession or post; compound nouns take 's at the end.",
    "explanation": "'Male' or 'female' before a noun describes the type of thing meant (female watch, male shoes, female doctor meaning a doctor's kind specified for women). 'Man' or 'woman' before a noun names the person's profession or post (man soldier, woman student, woman doctor). To show possession with compound nouns, add apostrophe-s at the very end (sister-in-law's car).",
    "pairs": [
      {
        "wrong": "Raj went to a female doctor to get himself treated.",
        "right": "Raj went to a woman doctor to get himself treated."
      }
    ],
    "correct": [
      "She went to a female doctor.",
      "Sister-in-law's car is parked outside.",
      "He is a man soldier.",
      "She is a woman student."
    ]
  },
  {
    "id": 68,
    "title": "Antecedent Rule",
    "category": "Pronouns",
    "summary": "The noun or pronoun just before a relative pronoun is its antecedent; with no antecedent use whoever or whomever.",
    "explanation": "An antecedent is the noun or pronoun that comes just before a relative pronoun, such as 'him' in 'Ram met him who they say has helped us'. If a sentence has no antecedent, compound relative pronouns like whoever and whomever are used instead of who and whom.",
    "pairs": [],
    "correct": [
      "Ram met him who they say has helped us.",
      "He saw her whom everyone admires.",
      "Ram met whoever had helped us.",
      "He saw whomever everyone admires."
    ]
  },
  {
    "id": 69,
    "title": "Question Tags",
    "category": "Sentence Structure",
    "summary": "A question tag added to a positive statement is negative, and one added to a negative statement is positive.",
    "explanation": "A small question added at the end of a statement is called a question tag. The tag always has the opposite polarity to the main statement: negative after a positive statement and positive after a negative one.",
    "pairs": [],
    "correct": [
      "He has worked very hard on this project, hasn't he?",
      "He has not worked hard on this project, has he?"
    ]
  },
  {
    "id": 70,
    "title": "Aren't I (not Amn't I)",
    "category": "Sentence Structure",
    "summary": "The tag for 'I am' is 'aren't I', never 'amn't I'.",
    "explanation": "There is no such word as 'amn't' in standard English. When the statement has 'I am', the negative question tag is 'aren't I', which stands for 'am I not'.",
    "pairs": [
      {
        "wrong": "I am working very hard for my students, amn't I?",
        "right": "I am working very hard for my students, aren't I?"
      }
    ],
    "correct": [
      "I am getting better at this, aren't I?"
    ]
  },
  {
    "id": 71,
    "title": "Tags after Seldom, Barely, Hardly, Scarcely, Never",
    "category": "Sentence Structure",
    "summary": "Words like seldom, barely, hardly, scarcely and never make a statement negative, so use a positive question tag.",
    "explanation": "Seldom, barely, hardly, scarcely and never carry a negative meaning, so the sentence counts as negative even without 'not'. The question tag must therefore be positive.",
    "pairs": [],
    "correct": [
      "He seldom comes to my house, does he?",
      "They have barely enough to pay the rent this month, have they?",
      "I never realised you knew my brother, did I?",
      "We hardly ever go to concerts, do we?",
      "I scarcely registered the fact that he was there, did I?"
    ]
  },
  {
    "id": 72,
    "title": "Question Tag in the Same Tense",
    "category": "Sentence Structure",
    "summary": "A question tag must be in the same tense as the main statement.",
    "explanation": "The auxiliary verb in the tag must match the tense of the main sentence. If the statement is in the present continuous, the tag cannot use a simple present auxiliary like 'don't'.",
    "pairs": [
      {
        "wrong": "I am doing the work which you gave me, don't I?",
        "right": "I am doing the work which you gave me, aren't I?"
      }
    ],
    "correct": [
      "She is reading a book, isn't she?"
    ]
  },
  {
    "id": 73,
    "title": "Each / Every in Question Tags",
    "category": "Subject-Verb Agreement",
    "summary": "Each and every take a singular verb in the main clause but are treated as plural in the question tag.",
    "explanation": "In the main statement, 'each' or 'every' is followed by a singular noun or pronoun and a singular verb. However, in the question tag the pronoun that refers back to them is considered plural, so a plural pronoun and plural verb are used.",
    "pairs": [
      {
        "wrong": "Every girl is very talented, isn't she?",
        "right": "Every girl is very talented, aren't they?"
      },
      {
        "wrong": "Each one has to work hard to make both ends meet, hasn't he?",
        "right": "Each one has to work hard to make both ends meet, haven't they?"
      }
    ],
    "correct": []
  },
  {
    "id": 74,
    "title": "Collective Nouns in Question Tags",
    "category": "Subject-Verb Agreement",
    "summary": "A collective noun is singular (tag with 'it') when its members act as one, and plural (tag with 'they') when they act separately.",
    "explanation": "If all members of a collective noun are doing the same thing or acting together, the group is treated as singular and the tag uses 'it'. If the units are acting on different things or individually, the group is plural and the tag uses 'they'.",
    "pairs": [],
    "correct": [
      "The jury has taken the decision, hasn't it?",
      "The audience took the seats, didn't they?",
      "The army changed the uniforms, didn't they?"
    ]
  },
  {
    "id": 75,
    "title": "Imperatives with 'Let us' and 'shall we'",
    "category": "Sentence Structure",
    "summary": "After 'Let us' or 'Let's' proposals and imperatives, the question tag is 'shall we'.",
    "explanation": "When a sentence makes a proposal or begins with 'Let us', the question tag is always 'shall we?' and never 'don't we?' or any other form.",
    "pairs": [
      {
        "wrong": "Let us go for a walk, don't we?",
        "right": "Let us go for a walk, shall we?"
      }
    ],
    "correct": [
      "Let us consider all the possibilities, shall we?",
      "Let us hear from Sue at our travel desk, shall we?",
      "Let us go out to dinner, shall we?"
    ]
  },
  {
    "id": 76,
    "title": "Prepositions of Time and Place: In, On, At",
    "category": "Prepositions",
    "summary": "Use 'at' for points, 'on' for surfaces and days, and 'in' for areas and longer periods; the order of size is at < on < in.",
    "explanation": "'In' refers to larger areas like towns, cities and countries; 'at' is for smaller places. As a concept, 'in' means area or volume, 'on' means surface, and 'at' means a point. For time, the order is point of time < day < month < year, so use 'at' for clock times, 'on' for days and dates, and 'in' for months, years and parts of the day. No preposition is used before words like last Monday, coming Monday, today, tomorrow and yesterday.",
    "pairs": [],
    "correct": [
      "There's a meeting at 2.30 this afternoon.",
      "Hair salons don't usually open on Sundays.",
      "My birthday is on 30 May.",
      "I started working here in 2009.",
      "We are going to Italy in April.",
      "Bye, see you in the morning.",
      "I am having dinner with Rachel tomorrow night.",
      "I saw her yesterday afternoon."
    ]
  },
  {
    "id": 77,
    "title": "Both... and (not as well as)",
    "category": "Conjunctions",
    "summary": "'Both' must be paired with 'and', never with 'as well as'; the word 'good' is followed by 'at'.",
    "explanation": "The conjunction 'both' always works with 'and' to join two items. Using 'as well as' after 'both' is wrong. Separately, the adjective 'good' takes the preposition 'at' when speaking of a skill.",
    "pairs": [
      {
        "wrong": "Both Ram as well as Shyam are good at English.",
        "right": "Both Ram and Shyam are good at English."
      },
      {
        "wrong": "Both men as well as women have complained about the advertisement.",
        "right": "Both men and women have complained about the advertisement."
      },
      {
        "wrong": "I felt both happy as well as sad at the same time.",
        "right": "I felt both happy and sad at the same time."
      }
    ],
    "correct": [
      "She is very good at geography.",
      "Rohan is good at football."
    ]
  },
  {
    "id": 78,
    "title": "Use of 'Lest'",
    "category": "Conjunctions",
    "summary": "'Lest' means 'otherwise' and is followed by 'should' or by a plain verb with no helping verb.",
    "explanation": "The conjunction 'lest' means otherwise, and it is followed either by the helping verb 'should' or by the bare verb with no helping verb at all. 'Would' and similar helping verbs are not used after it.",
    "pairs": [
      {
        "wrong": "Work hard, lest you would fail.",
        "right": "Work hard, lest you fail."
      }
    ],
    "correct": [
      "Work hard, lest you should fail.",
      "He cut the remark out of the final program lest it should offend listeners."
    ]
  },
  {
    "id": 79,
    "title": "Until vs Unless",
    "category": "Conjunctions",
    "summary": "'Until' is time oriented while 'unless' is action oriented; 'till' cannot begin a sentence.",
    "explanation": "'Until' refers to a time ('until sunset'), whereas 'unless' refers to an action or condition. 'Till' and 'until' mean the same, up to the time that, but 'till' is not used at the start of a sentence, whereas 'until' can be.",
    "pairs": [],
    "correct": [
      "Wait for me until sunset.",
      "Unless the government reduces the tax, the tax-payer base will not increase.",
      "I was up until three o'clock trying to get it finished!",
      "Unless you call me to say you're not coming, I will see you at the theatre.",
      "Until your next birthday, you will have to wait for a new bike.",
      "We did not eat till past midnight."
    ]
  },
  {
    "id": 80,
    "title": "Parallelism",
    "category": "Sentence Structure",
    "summary": "Elements in a sentence that are alike in function must share the same grammatical form.",
    "explanation": "Parallelism means that words, infinitives, prepositional phrases, clauses, linking pairs (not only... but also, either... or, neither... nor), nouns and adjectives joined together should be in the same form. Mixing, for example, an -ing form with an infinitive in a list breaks the parallel structure. Correlative pairs must be followed by the same type of phrase.",
    "pairs": [
      {
        "wrong": "I like singing, dancing, and to walk.",
        "right": "I like singing, dancing, and walking."
      },
      {
        "wrong": "He asked his mother to cook, to rest and prepare the dish.",
        "right": "He asked his mother to cook, to rest and to prepare the dish."
      },
      {
        "wrong": "My friends never judged me by my words or what I did.",
        "right": "My friends never judged me by my words or my actions."
      },
      {
        "wrong": "The teacher not only wants his students to keep quiet but also to do the task.",
        "right": "The teacher wants his students not only to keep quiet but also to do the task."
      },
      {
        "wrong": "I like to read books over watching movies.",
        "right": "I like reading books over watching movies."
      },
      {
        "wrong": "I would rather pay for my education than financial aid.",
        "right": "I would rather pay for my education than receive financial aid."
      },
      {
        "wrong": "Tom is known for his honesty and original ideas.",
        "right": "Tom is known for his honesty and originality."
      },
      {
        "wrong": "To learn is understanding the world.",
        "right": "To learn is to understand the world."
      }
    ],
    "correct": [
      "This task can be done individually, in pairs, or in groups of four."
    ]
  },
  {
    "id": 81,
    "title": "Proper Prepositions after Words",
    "category": "Prepositions",
    "summary": "Many words need one specific preposition after them, so learn the correct word-preposition pairs.",
    "explanation": "Certain nouns, adjectives and verbs go with fixed prepositions: superior to, older than, different from, better than, responsibility for, reason for, increase in, address of, reaction to, response to, attempt at, inquiry into, research into, advertisement for, congratulations on, knowledge of, member of, visit to. Choosing a wrong preposition makes the sentence incorrect.",
    "pairs": [],
    "correct": [
      "He is superior to and older than me.",
      "This book is different from and better than that book.",
      "Nobody seems to have responsibility for the budget.",
      "There's been a steady increase in the value of the euro.",
      "Her response to the criticism was very strong.",
      "Fisk is making his third attempt at the world record.",
      "She did some research into the causes of back pain.",
      "He has an amazing knowledge of European history."
    ]
  },
  {
    "id": 82,
    "title": "Too Much vs Much Too",
    "category": "Adjectives & Adverbs",
    "summary": "'Too much' (adjective) goes before uncountable nouns; 'much too' (adverb) goes before adjectives or adverbs.",
    "explanation": "'Too much' acts as an adjective and indicates an excessive quantity of an uncountable noun, e.g. too much sugar. 'Much too' acts as an adverb and strengthens an adjective, meaning far too, e.g. much too heavy. Use too much before nouns and much too before adjectives.",
    "pairs": [
      {
        "wrong": "He is too much strong.",
        "right": "He is much too strong."
      },
      {
        "wrong": "There is much too sugar.",
        "right": "There is too much sugar."
      }
    ],
    "correct": [
      "He drank too much alcohol last night, and this morning he feels ill.",
      "Too much work and not enough play make Jack a dull boy.",
      "This car is much too expensive for me to buy.",
      "This case is much too heavy; you can't carry it!"
    ]
  },
  {
    "id": 83,
    "title": "Possessive Case Followed by a Noun",
    "category": "Nouns & Articles",
    "summary": "A possessive word must be followed by a noun, including nouns that exist only in plural form.",
    "explanation": "After a possessive like 'his' or 'her', a noun must follow. Some verbs become nouns by adding 's' (belong - belongings, earn - earnings, surround - surroundings). Several nouns are always plural, such as riches, premises, spectacles, valuables, proceeds, wages, trousers, scissors, goods and tongs.",
    "pairs": [],
    "correct": [
      "His belongings were lost.",
      "His earnings are not enough.",
      "His surroundings are not clean.",
      "All his goods were sold at throw away prices.",
      "Spectacles have been broken.",
      "Kindly give me a pair of scissors."
    ]
  },
  {
    "id": 84,
    "title": "Politics: Singular or Plural",
    "category": "Subject-Verb Agreement",
    "summary": "'Politics' is singular when it means a field or subject and plural when it means political beliefs.",
    "explanation": "When 'politics' refers to a field of study or activity, use a singular verb. When it refers to a set of political beliefs or views, use a plural verb.",
    "pairs": [],
    "correct": [
      "Politics is a very dirty game.",
      "His politics are different from mine.",
      "Her politics have become more liberal over the past few years.",
      "His politics are generally considered to be right of centre.",
      "Politics is the main subject at Leicester University."
    ]
  },
  {
    "id": 85,
    "title": "Mathematics and Statistics",
    "category": "Subject-Verb Agreement",
    "summary": "Mathematics and statistics take a singular verb as subjects, but plural as 'calculations' or 'data'; 'data' is plural and 'summons' becomes 'summonses'.",
    "explanation": "As fields of study, mathematics and statistics are uncountable and use a singular verb. When they mean calculations or data respectively, the book treats them as plural. Data is plural (singular datum), so it takes a plural verb. The word summons is singular; its plural is summonses.",
    "pairs": [
      {
        "wrong": "Data warns us and we will have to change our strategy.",
        "right": "Data warn us and we will have to change our strategy."
      },
      {
        "wrong": "Two summons were issued.",
        "right": "Two summonses were issued."
      }
    ],
    "correct": [
      "Mathematics is an interesting subject.",
      "Statistics is difficult to understand.",
      "Statistics tell us that it will rain today."
    ]
  },
  {
    "id": 86,
    "title": "A vs The with Possessive and Objective Case",
    "category": "Nouns & Articles",
    "summary": "'The' is used for 'only one' with the objective case, while 'a' means 'one of many' and goes with the possessive case.",
    "explanation": "Use 'a' for one of many and 'the' for only one. Likewise, 'a' pairs with the possessive case (a brother of mine) and 'the' pairs with the objective case (the brother of me). So 'the brother of me' implies one brother, whereas 'a brother of mine' implies several brothers.",
    "pairs": [],
    "correct": [
      "The brother of me is a scientist.",
      "A brother of mine is a scientist.",
      "A servant of theirs lives in Delhi.",
      "The servant of them lives in Delhi."
    ]
  },
  {
    "id": 87,
    "title": "Too, As Well and Also",
    "category": "Redundancy & Word Usage",
    "summary": "'Also' cannot end a sentence, though 'too' and 'as well' can; 'too' meaning 'very' cannot stand alone.",
    "explanation": "To add an extra thing, use too, as well or also, but 'also' cannot be used at the end of the sentence. When 'too' means high intensity rather than addition, it must be followed by a result such as 'to go outside' or 'that...'; otherwise, the sentence is incomplete and 'very' is used.",
    "pairs": [
      {
        "wrong": "I have brought a bag also.",
        "right": "I have brought a bag too."
      },
      {
        "wrong": "She is too beautiful.",
        "right": "She is very beautiful."
      }
    ],
    "correct": [
      "I have brought a bag as well.",
      "I have also brought a bag.",
      "It is too hot to go outside.",
      "It is so hot that I cannot go outside.",
      "The question was too difficult to solve."
    ]
  },
  {
    "id": 88,
    "title": "Optative Sentences",
    "category": "Sentence Structure",
    "summary": "Optative sentences express a wish or prayer, begin with 'may' or 'wish', and use the base verb.",
    "explanation": "A sentence that expresses a prayer, keen wish or curse is optative. It generally begins with 'may' or 'wish', although 'may' is sometimes hidden. Whether the subject is singular or plural, the base form of the verb (the first form) is used.",
    "pairs": [],
    "correct": [
      "May God bless you!",
      "Long live the king.",
      "May the almighty help in this tragedy!",
      "Wish you a happy journey together."
    ]
  },
  {
    "id": 89,
    "title": "Pseudo Subjects",
    "category": "Sentence Structure",
    "summary": "When an opening phrase is unrelated to the main subject, add 'It' as a pseudo subject.",
    "explanation": "If the introductory part of a sentence talks about something that has no relation to the main subject, we add a pseudo subject, 'it'. If the introductory participle phrase does refer to the main subject (like 'Being ill, he...'), no pseudo subject is needed.",
    "pairs": [
      {
        "wrong": "Being a rainy day, I did not go to school.",
        "right": "It being a rainy day, I did not go to school."
      },
      {
        "wrong": "Being vacant, I did not enter the room.",
        "right": "It being vacant, I did not enter the room."
      }
    ],
    "correct": [
      "Being ill, he did not come to class."
    ]
  },
  {
    "id": 90,
    "title": "Infinitive Followed by a Preposition",
    "category": "Prepositions",
    "summary": "When an infinitive talks about a noun, it is followed by a preposition.",
    "explanation": "If an infinitive (to + verb) is used to describe the purpose of a noun, the preposition connected to that verb must be placed after it, as in 'a bed to sleep in' and 'a pen to write with'.",
    "pairs": [],
    "correct": [
      "The child has no bed to sleep in.",
      "I have a pen to write with.",
      "The child wanted a toy to play with."
    ]
  },
  {
    "id": 91,
    "title": "Two Different Helping Verbs",
    "category": "Verbs & Tenses",
    "summary": "When two different helping verbs are needed, the main verb must be repeated in both parts.",
    "explanation": "If two helping verbs need different forms of the main verb (have watched and will watch), the correct form of the main verb must appear with each helping verb rather than being shared.",
    "pairs": [
      {
        "wrong": "I have never and will never watch this movie.",
        "right": "I have never watched and will never watch this movie."
      }
    ],
    "correct": [
      "She has never lied and will never lie to you."
    ]
  },
  {
    "id": 92,
    "title": "Plural-Only Nouns Take Plural Verbs",
    "category": "Subject-Verb Agreement",
    "summary": "Words such as belongings, scissors, proceeds, clothes and trousers are always plural and take plural verbs.",
    "explanation": "Many nouns exist only in plural form, such as belongings, savings, congratulations, scissors, proceeds, surroundings, regards, pliers, tongs, jeans, pyjamas, pantaloons, shorts, contents, outskirts, glasses, clothes, thanks, goggles, premises, earnings and tidings. They are always followed by a plural verb. To count them, use 'a pair of'.",
    "pairs": [],
    "correct": [
      "His regards were conveyed to his parents.",
      "All proceeds from the auction are donated to charity.",
      "His belongings were lost.",
      "These scissors are for cutting paper.",
      "Your clothes are dirty.",
      "My trousers are dirty.",
      "Her thanks were clearly sincere.",
      "Are those your belongings?"
    ]
  },
  {
    "id": 93,
    "title": "Singular-Looking Nouns Take Singular Verbs",
    "category": "Subject-Verb Agreement",
    "summary": "Words like mathematics, physics, news, economics and athletics are singular and take singular verbs.",
    "explanation": "Words ending in -s such as mathematics, physics, statistics, news, economics, innings, politics, athletics, gymnastics, gallows, mechanics, summons and classics are considered singular and always use singular verbs. The exceptions for mathematics, statistics and politics were discussed earlier.",
    "pairs": [
      {
        "wrong": "Mathematics are difficult subject.",
        "right": "Mathematics is a difficult subject."
      },
      {
        "wrong": "Politics are a game of compromise.",
        "right": "Politics is a game of compromise."
      },
      {
        "wrong": "These news were broadcast from All India Radio only yesterday.",
        "right": "This news was broadcast from All India Radio only yesterday."
      }
    ],
    "correct": []
  },
  {
    "id": 94,
    "title": "Uncountable Nouns",
    "category": "Nouns & Articles",
    "summary": "Words like furniture, luggage, information, advice and hair are uncountable and have no plural form.",
    "explanation": "Nouns such as equipment, furniture, jewellery, luggage, machinery, poetry, scenery, information, advice, baggage and hair are uncountable, so they do not take a plural form or the article 'a'. Add a measure phrase like 'a piece of' to count them.",
    "pairs": [
      {
        "wrong": "His luggages was booked.",
        "right": "His luggage was booked."
      },
      {
        "wrong": "He has given me a good information.",
        "right": "He has given me good information."
      },
      {
        "wrong": "The poetries Society was founded in 1909.",
        "right": "The Poetry Society was founded in 1909."
      }
    ],
    "correct": [
      "Here is the list of stationery.",
      "Furniture is expensive in this shop."
    ]
  },
  {
    "id": 95,
    "title": "Rules of Conditional Sentences",
    "category": "Conditionals",
    "summary": "The verb form in the if-clause decides the form of the result clause in a conditional sentence.",
    "explanation": "Simple present condition takes a result with will, shall, can, may or must plus the base verb. Simple past condition takes would, could, might or should plus the base verb. Past perfect condition takes would, could, might or should plus have plus the past participle. A condition can also be expressed by inversion, as in 'Had he come earlier'.",
    "pairs": [],
    "correct": [
      "As soon as he comes, I will ask him this question.",
      "When he comes, I will ask him this question.",
      "Had he come earlier, I would have asked him this question.",
      "If he studied, he would pass the exam."
    ]
  },
  {
    "id": 96,
    "title": "Possessive Case after All and Both",
    "category": "Pronouns",
    "summary": "Place the possessive word after 'all' and 'both', not before them.",
    "explanation": "When a possessive such as my, his or our is used with 'all' or 'both', the possessive comes after those words. So we say 'all my students' and 'both my friends', never 'my all students' or 'my both friends'.",
    "pairs": [
      {
        "wrong": "My all students are very talented.",
        "right": "All my students are very talented."
      },
      {
        "wrong": "My both friends are very talented.",
        "right": "Both my friends are very talented."
      }
    ],
    "correct": []
  },
  {
    "id": 97,
    "title": "Superfluous Words (As soon as / No sooner / As / Due to)",
    "category": "Redundancy & Word Usage",
    "summary": "Do not add an extra 'than' after 'as soon as', an extra 'so' after 'as', or 'due to' with 'the reason'.",
    "explanation": "'As soon as' is never followed by 'than'; 'than' belongs after 'no sooner'. The word 'as' used at the start of a clause is not paired with 'so' in the main clause. 'Due to' is not combined with 'the reason' (and vice versa); rewrite the sentence instead, for example with 'due to sickness'.",
    "pairs": [
      {
        "wrong": "As soon as I complete the work than I will go to his house.",
        "right": "As soon as I complete the work I will go to his house."
      },
      {
        "wrong": "As he was unwell, so he didn't come to the class.",
        "right": "As he was unwell, he didn't come to the class."
      },
      {
        "wrong": "Due to the reason that he is not well, he did not come to the class.",
        "right": "He did not come to the class due to sickness."
      }
    ],
    "correct": [
      "No sooner had I started mowing the lawn than it started raining."
    ]
  },
  {
    "id": 98,
    "title": "Usage of the Word Quantity",
    "category": "Redundancy & Word Usage",
    "summary": "With the word 'quantity' use 'small' or 'large', not 'little' or 'few'.",
    "explanation": "When the noun 'quantity' appears in a sentence, words like little and few cannot be used to describe it. The correct describing word is 'small' (or 'large').",
    "pairs": [
      {
        "wrong": "Little quantity of food was wasted.",
        "right": "A small quantity of food was wasted."
      },
      {
        "wrong": "Few quantity of food was wasted.",
        "right": "A small quantity of food was wasted."
      }
    ],
    "correct": []
  },
  {
    "id": 99,
    "title": "Confusing Verb Forms (Fly/Flow, Find/Found, Hang)",
    "category": "Verbs & Tenses",
    "summary": "Fly, flow, find, found and hang have look-alike forms that must be chosen by meaning.",
    "explanation": "Fly-flew-flown; flow-flowed-flowed; find-found-found; found (to establish)-founded-founded; hang (a prisoner)-hanged-hanged; hang (other things)-hung-hung. 'Founded' means something was established, while 'found' means discovered. 'Hanged' is used for execution of a prisoner and 'hung' for objects such as a clock on a wall.",
    "pairs": [
      {
        "wrong": "The water overflown from the banks.",
        "right": "The water overflowed from the banks."
      },
      {
        "wrong": "The secretary has found this organisation.",
        "right": "The secretary has founded this organisation."
      }
    ],
    "correct": [
      "The prisoner was hanged till death.",
      "The clock was hung on the wall."
    ]
  },
  {
    "id": 100,
    "title": "Different Forms of Lie and Lay",
    "category": "Verbs & Tenses",
    "summary": "Lie (to deceive) is lie-lied-lied, lay (to put) is lay-laid-laid, and lie (to recline) is lie-lay-lain.",
    "explanation": "There are three verbs. 'Lie' meaning to say something untrue gives lied and lied. 'Lay' meaning to put something down carefully gives laid and laid. 'Lie' meaning to be in a flat position gives lay and lain.",
    "pairs": [],
    "correct": [
      "I suspect he lies about his age.",
      "She lied to her parents about her new car.",
      "He has never lied to me before, so I have no reason to doubt his word.",
      "He lays the book on the table.",
      "She laid the baby on the bed.",
      "He has laid his bag on the ground.",
      "He lies awake at night, worrying.",
      "The old book had lain on the shelf for years."
    ]
  },
  {
    "id": 101,
    "title": "Prepositions with the Word Die",
    "category": "Prepositions",
    "summary": "Use 'die of' for diseases and 'die from' for external causes or reasons.",
    "explanation": "We use 'die of' when a disease is the cause and 'die from' when a reason is given. Other forms: 'die in' means to experience death in a specific place or circumstance, 'die by' refers to the cause or means of death, and 'die with' refers to the circumstances or company at the time of death.",
    "pairs": [],
    "correct": [
      "She died from overwork.",
      "He died of cancer.",
      "He died of tuberculosis.",
      "Trees are dying from acid rain."
    ]
  },
  {
    "id": 102,
    "title": "Beside vs Besides",
    "category": "Prepositions",
    "summary": "'Beside' means at the side of or next to, while 'besides' means in addition to.",
    "explanation": "'Beside' is a preposition meaning at the side of or next to something. 'Besides' is a linking adverb (also used as a preposition) meaning in addition to, or also.",
    "pairs": [],
    "correct": [
      "Come and sit here beside me.",
      "She knelt down beside the child.",
      "Do you play any other sports besides basketball?",
      "Besides being a doctor, he is also an actor."
    ]
  },
  {
    "id": 103,
    "title": "Words That Are Only Adjectives (Friendly, Miserly, etc.)",
    "category": "Adjectives & Adverbs",
    "summary": "Words like friendly, miserly, cowardly, monthly, yearly, weekly, manly and orderly are adjectives and cannot be used as adverbs.",
    "explanation": "Several words ending in -ly are adjectives only. They can describe a noun but cannot modify a verb. To modify a verb, rewrite the sentence with a phrase such as 'in a friendly manner'.",
    "pairs": [
      {
        "wrong": "He behaved friendly.",
        "right": "He behaved in a friendly manner."
      }
    ],
    "correct": [
      "This was a particularly brutal and cowardly attack.",
      "The workers are paid a miserly $2 a day.",
      "She put the letters in three orderly piles.",
      "There was a weekly dance on Wednesdays.",
      "One quality she especially likes to reward is thus held to be manly courage.",
      "Newspapers are constrained by a yearly license required from the Home Ministry.",
      "Other than the monthly meeting, not much is going on at the association."
    ]
  },
  {
    "id": 104,
    "title": "Position of Adverbs",
    "category": "Adjectives & Adverbs",
    "summary": "An adverb goes at the start of a sentence, between the helping and main verb, or at the end, but never between the main verb and its object.",
    "explanation": "The three usual positions of an adverb are the start of the sentence, between the helping verb and main verb, and the end of the sentence. Never place an adverb between the main verb and the object. Adverbs of frequency such as always and often go before the main verb. There are a few exceptions, and adverbs like too and even can be placed almost anywhere.",
    "pairs": [
      {
        "wrong": "He comes often to my house.",
        "right": "He often comes to my house."
      },
      {
        "wrong": "He tells always the truth.",
        "right": "He always tells the truth."
      }
    ],
    "correct": [
      "Suddenly the phone rang.",
      "He was probably late for the interview."
    ]
  },
  {
    "id": 105,
    "title": "Order of Multiple Adverbs",
    "category": "Adjectives & Adverbs",
    "summary": "When several adverbs are used, the order is manner, place, frequency, then time (MPT).",
    "explanation": "Follow the sequence Adverb of Manner, Adverb of Place, Adverb of Frequency, Adverb of Time. A shorter version of the pattern is manner before time, as in 'slowly yesterday'.",
    "pairs": [
      {
        "wrong": "I walked yesterday slowly.",
        "right": "I walked slowly yesterday."
      }
    ],
    "correct": [
      "I have to run quickly down the street each morning after breakfast.",
      "Impatiently, I waited by the bank yesterday for my father to arrive."
    ]
  },
  {
    "id": 106,
    "title": "Usage of Very and Much",
    "category": "Adjectives & Adverbs",
    "summary": "'Very' goes before adjectives and adverbs in the positive degree, while 'much' goes with comparatives, past participles, and 'too' or 'so'.",
    "explanation": "'Very' is used before an adjective or adverb in its positive form and stresses the exact identity of a person or thing. 'Much' means a large amount or extent and is used before comparatives, with past participles, or after 'too', 'so' and 'thank you'. We do not normally use 'very' with superlatives and use 'much' or 'by far' instead; however, 'very' can emphasise a superlative and is used with first, next and last.",
    "pairs": [],
    "correct": [
      "It is very interesting.",
      "He is much weaker than Shyam.",
      "The girl is very beautiful.",
      "The weather changes very quickly.",
      "I am much better now.",
      "They both talk too much.",
      "He is much interested in the project.",
      "This is the very best wine I have tasted in my life."
    ]
  },
  {
    "id": 107,
    "title": "Between Is Followed by And",
    "category": "Conjunctions",
    "summary": "'Between' is always paired with 'and', never with 'to'; use 'from ... to' instead.",
    "explanation": "The word 'between' takes 'and' to link the two limits. If you want to use 'to', the phrase must begin with 'from' (from 4 pm to 5 pm).",
    "pairs": [
      {
        "wrong": "He will distribute these sweets between 4 pm to 5 pm.",
        "right": "He will distribute these sweets between 4 pm and 5 pm."
      }
    ],
    "correct": [
      "He will distribute these sweets from 4 pm to 5 pm."
    ]
  },
  {
    "id": 108,
    "title": "Uncountable Nouns with a Different Plural Meaning",
    "category": "Nouns & Articles",
    "summary": "Some nouns, especially uncountable ones, take a different meaning when s or es is added.",
    "explanation": "Generally uncountable nouns cannot be pluralised, but some change meaning in the plural: advice (suggestion) vs advices (information), air (atmosphere) vs airs (arrogance), wood (timber) vs woods (forest), iron (metal) vs irons (fetters). Other pairs: abuse/abuses, force (strength)/forces (troops), issue (result)/issues (results), light (lamp or brilliance)/lights (lamps), gain/gains (profits), people (persons)/peoples (nations), arm (limb)/arms (weapons), pain (ache)/pains (troubles or care), manner (method)/manners (behaviour), custom (habit)/customs (duties on goods), letter/letters (learning), spectacle (sight)/spectacles (eye-glasses), colour/colours (flags), minute/minutes (proceedings of a meeting), moral (lesson)/morals (conduct). The book also lists work (job)/works (factories or compositions), good (nice)/goods (property), content/contents, authority/authorities, respect/respects (compliments), brother/brothers vs brethren, cloth/cloths vs clothes, die/dies vs dice, genius/geniuses, index/indexes vs indices, fish/fishes, penny/pennies vs pence. Word pairs such as habit/custom, house/home, cause/reason, air/wind, cost/price, customer/client, shade/shadow and ground/floor are also contrasted.",
    "pairs": [],
    "correct": [
      "Wood is used in almost all wooden houses.",
      "He lives in the woods.",
      "Woods are fast disappearing from India.",
      "Force should be met with force.",
      "A force of ten persons attacked him.",
      "The Indian Forces are known for their bravery and loyalty.",
      "He caught the old man by the arm.",
      "Pakistan is buying arms from the USA."
    ]
  },
  {
    "id": 109,
    "title": "Errors with Noun Modifiers (English teacher, etc.)",
    "category": "Redundancy & Word Usage",
    "summary": "Use 'teacher of English' rather than 'English teacher', since a noun used as a modifier can change the meaning.",
    "explanation": "Phrases like 'English teacher' mean a teacher from England, 'Mathematics teacher' would mean a teacher made of mathematics, and 'family members' would mean members made up of family, so they are not meaningful here. Rewrite them with 'of'. The book adds that 'pick-pocketer', 'cousin brother' and 'cousin sister' do not exist, and lists several usage points such as meals, alphabet, innings, agenda and mankind.",
    "pairs": [
      {
        "wrong": "I am an English teacher.",
        "right": "I am a teacher of English."
      },
      {
        "wrong": "He is a Mathematics teacher.",
        "right": "He is a teacher of Mathematics."
      },
      {
        "wrong": "All his family members were going to the temple.",
        "right": "All the members of his family were going to the temple."
      }
    ],
    "correct": [
      "Food taken once is a meal and not meals.",
      "Agenda is treated as singular in English."
    ]
  },
  {
    "id": 110,
    "title": "Use of Possessive Adjectives",
    "category": "Pronouns",
    "summary": "'One' takes 'one's', while 'every' and 'each' subjects take his or her; words like one's and his are possessive adjectives, not pronouns.",
    "explanation": "Possessive adjectives modify a noun and show ownership, as in 'one's duty'. Use 'one's' only when the subject is 'one'. When the subject is every, each, everybody, etc., use 'his' or 'her' according to gender, and if gender is unclear give priority to 'his'.",
    "pairs": [
      {
        "wrong": "Everyone should do one's duty.",
        "right": "Everyone should do his duty."
      },
      {
        "wrong": "One should do his duty.",
        "right": "One should do one's duty."
      }
    ],
    "correct": [
      "Every girl should do her duty."
    ]
  },
  {
    "id": 111,
    "title": "Use of Fewer and Less",
    "category": "Adjectives & Adverbs",
    "summary": "Use 'fewer' with countable nouns and 'less' with uncountable nouns.",
    "explanation": "'Fewer' goes with countable subjects such as students, while 'less' goes with uncountable subjects such as water. The book's examples show the wrong choice being swapped for the right one.",
    "pairs": [
      {
        "wrong": "No less than 50 students completed the work.",
        "right": "No fewer than 50 students completed the work."
      },
      {
        "wrong": "There is no fewer than five liters of water in the vessel.",
        "right": "There is no less than five liters of water in the vessel."
      }
    ],
    "correct": []
  },
  {
    "id": 112,
    "title": "Elder vs Older and Other Confusing Pairs",
    "category": "Redundancy & Word Usage",
    "summary": "Elder is for family members, older for others; later/latter, farther/further, nearest/next, latest/last and less/lesser also differ.",
    "explanation": "'Elder' is used for someone in our family and 'older' for someone not in the family. 'Later' refers to time while 'latter' is the second of two things mentioned. 'Farther' is for physical distance and 'further' for metaphorical distance or degree. 'Nearest' is for space or distance and 'next' for order or position. 'Latest' means most recent, while 'last' is opposite of first. 'Less' goes with uncountable nouns and 'fewer' with countable; 'less' also means smaller in size or amount, and 'lesser' means not so great as the other.",
    "pairs": [
      {
        "wrong": "A friend of mine in my company is elder than me.",
        "right": "A friend of mine in my company is older than me."
      },
      {
        "wrong": "He has fewer money than I.",
        "right": "He has less money than I."
      }
    ],
    "correct": [
      "The elder son of King John, Henry was nine when his father died.",
      "Bran said that he would call me later.",
      "Villagers saw a temple on the farther side of the river.",
      "Suman has appealed in the high court for further judgement.",
      "Delhi railway station is nearest to my house.",
      "Mr. Gupta lives in the next house.",
      "She is the last girl to stay in the office.",
      "What is the latest news today?"
    ]
  },
  {
    "id": 113,
    "title": "Comparing Like with Like",
    "category": "Sentence Structure",
    "summary": "A comparison must be between similar things, so repeat the noun or use 'that of' or 'those of'.",
    "explanation": "If you compare 'the weather of Delhi' with 'Mumbai', you compare unlike things. Compare it with 'the weather of Mumbai' or 'that of Mumbai'. For plural nouns use 'those of'.",
    "pairs": [
      {
        "wrong": "The weather of Delhi is far better than Mumbai.",
        "right": "The weather of Delhi is far better than that of Mumbai."
      },
      {
        "wrong": "The apples of Shimla are tastier than Ooty.",
        "right": "The apples of Shimla are tastier than those of Ooty."
      }
    ],
    "correct": [
      "The weather of Delhi is far better than the weather of Mumbai."
    ]
  },
  {
    "id": 114,
    "title": "One of, Either of, Neither of, Each of",
    "category": "Subject-Verb Agreement",
    "summary": "'One of', 'either of', 'neither of' and 'each of' are followed by plural nouns.",
    "explanation": "These expressions refer to one member of a group, so the noun that follows must be plural (the students, the light bulbs, the meetings), although the verb stays singular.",
    "pairs": [
      {
        "wrong": "One of the student was selected to visit NASA.",
        "right": "One of the students was selected to visit NASA."
      },
      {
        "wrong": "A person can turn on either of the light bulb.",
        "right": "A person can turn on either of the light bulbs."
      }
    ],
    "correct": [
      "Do you go to each of the meetings?"
    ]
  },
  {
    "id": 115,
    "title": "But, Except, Between Take the Objective Case",
    "category": "Pronouns",
    "summary": "After 'but', 'except' and 'between' used as prepositions, use the objective pronoun (me, him, them).",
    "explanation": "When 'but', 'except' or 'between' act as prepositions they must be followed by the objective case of a pronoun, not the subjective one. Also, 'let' is followed by the objective case.",
    "pairs": [
      {
        "wrong": "There is friendship between you and I.",
        "right": "There is friendship between you and me."
      },
      {
        "wrong": "All but he are going to the party.",
        "right": "All but him are going to the party."
      },
      {
        "wrong": "Let he do the work.",
        "right": "Let him do the work."
      }
    ],
    "correct": [
      "All except him are going to the party."
    ]
  },
  {
    "id": 116,
    "title": "Pronoun after a Pseudo Subject",
    "category": "Pronouns",
    "summary": "The pronoun following a pseudo subject such as 'it is' must be in the subjective case.",
    "explanation": "A pseudo subject like 'it' fills the syntactic slot of a subject but carries no meaning. The pronoun after it should be subjective (I, he, we) and the verb agrees with that pronoun. In 'It is a lovely day', the real subject is day and 'it' is only an introductory subject.",
    "pairs": [
      {
        "wrong": "It is him who should be blamed.",
        "right": "It is he who should be blamed."
      },
      {
        "wrong": "It is us who have defeated the champion.",
        "right": "It is we who have defeated the champion."
      },
      {
        "wrong": "It is me who am guilty.",
        "right": "It is I who am guilty."
      }
    ],
    "correct": [
      "It is a lovely day."
    ]
  },
  {
    "id": 117,
    "title": "Such As, Nothing Else But, Other Than",
    "category": "Conjunctions",
    "summary": "After the determiner 'such' use 'as', 'else' is followed by 'but', and 'other' by 'than'.",
    "explanation": "When 'such' is used as a determiner, its connector is 'as' and not 'that'. The word 'else' is followed by 'but', whereas 'other' and 'otherwise' are followed by 'than'.",
    "pairs": [
      {
        "wrong": "He is such a person that you mentioned.",
        "right": "He is such a person as you mentioned."
      }
    ],
    "correct": [
      "Such a book as this is referred by a teacher.",
      "They want nothing else but to have their honor and dignity.",
      "It was nothing else but sheer madness."
    ]
  },
  {
    "id": 118,
    "title": "Possession with Plural Nouns and Hissing Sounds",
    "category": "Nouns & Articles",
    "summary": "Avoid adding 's after a plural noun that ends in s; write only the apostrophe.",
    "explanation": "Do not add 's where it would create a hissing sound, as in girls's, so the apostrophe alone is used (girls'). The exception is 'else's', which is correct in spite of the hissing sound.",
    "pairs": [
      {
        "wrong": "Government girls's school.",
        "right": "Government girls' school."
      }
    ],
    "correct": [
      "For Jesus' sake.",
      "For peace' sake.",
      "Residents' Welfare Association.",
      "Pythagoras' theorem.",
      "For goodness' sake.",
      "For justice' sake."
    ]
  },
  {
    "id": 119,
    "title": "No Apostrophe with Possessive Pronouns",
    "category": "Pronouns",
    "summary": "Possessive pronouns like yours, hers, ours and theirs never take an apostrophe.",
    "explanation": "The apostrophe-s is used to show possession only with nouns. Pronouns such as yours, hers, ours, theirs and mine already show possession and must be written without an apostrophe.",
    "pairs": [
      {
        "wrong": "Your's friendly.",
        "right": "Yours friendly."
      }
    ],
    "correct": [
      "The kids are yours and mine.",
      "We shall finally have what is rightfully ours.",
      "The ring is hers.",
      "The bag is theirs.",
      "Their mother gets along well with yours."
    ]
  },
  {
    "id": 120,
    "title": "Words Never Followed by a Noun",
    "category": "Adjectives & Adverbs",
    "summary": "Words like afraid, asleep, due, ready, unable, alike, aware, glad, sorry, well, alone, ill, sure and worth are never followed by a noun.",
    "explanation": "These adjectives can only be used after a verb (predicatively) and do not directly precede a noun. They are used after verbs like be, seem and prove, as in 'He is glad' but not 'a glad boy'.",
    "pairs": [],
    "correct": [
      "We were unable to contact him at the time.",
      "The army is said to be ready for action.",
      "I am glad to know the parcel arrived safely.",
      "He likes being alone in the house.",
      "Your painting has come out really well.",
      "He has proved his worth to the team."
    ]
  }
]
