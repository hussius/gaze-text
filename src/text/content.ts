/**
 * Placeholder content until the artist's text arrives.
 *
 * `base` is what the reader sees first. `variant` is a parallel text with the
 * same paragraph count and roughly word-aligned sentences: the "rewrite"
 * effects swap base words for the variant word at the same relative position.
 */
export interface PageContent {
  header: string;
  pageNumber: number;
  base: string[];
  variant: string[];
}

export const placeholder: PageContent = {
  header: 'The Loose Page',
  pageNumber: 17,
  base: [
    'The page was left on the table by someone who did not return for it. It is an ordinary page, the kind that comes loose from a book nobody remembers buying, its margins soft from handling and its corners turned where a reader once stopped and meant to come back. The type is small and patient. It does not mind being read slowly.',
    'You begin at the top, as everyone does, and the lines open one after another like doors in a long corridor. Each sentence promises that the next will explain it. Somewhere a clock is ticking, or perhaps it is only the sound of your own attention moving from word to word, collecting them the way a hand collects stones from a shore.',
    'What you have read is behind you now. You could look back, of course. Nothing forbids it. But the page has its own memory, and it is not obliged to keep the shape you gave it. Words, once seen, are free to become something else. Perhaps they always were. Perhaps the reading was the only thing holding them still.',
  ],
  variant: [
    'The house was left in the dark by someone who did not return for it. It is an ordinary house, the kind that stands at the end of a road nobody remembers taking, its windows soft with dust and its doors left open where a visitor once paused and meant to come inside. The rooms are quiet and patient. They do not mind being forgotten slowly.',
    'You walk in at the front, as everyone does, and the rooms open one after another like pages in a long letter. Each doorway promises that the next will explain it. Somewhere water is dripping, or perhaps it is only the sound of your own breathing moving from room to room, gathering them the way a tide gathers stones from a shore.',
    'What you have seen is gone from you now. You could turn around, of course. Nothing prevents it. But the house has its own memory, and it is not obliged to keep the shape you gave it. Rooms, once left, are free to become something else. Perhaps they always were. Perhaps the looking was the only thing holding them still.',
  ],
};
