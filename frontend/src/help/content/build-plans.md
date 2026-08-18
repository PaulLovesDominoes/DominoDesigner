[Home](home) > [Build Designer](designer) > Printing a Build Plan

# Printing a build plan

A design on the screen still has to be built in the real world. Two printed
documents get you there, and they are used at different times by different
people:

-  **The Layout** — a picture of the field, one cell per domino, in the colors
   you chose, with a number in each cell saying which color it is. This is what
   you work from on site.
-  **The Sort Plan** — each row written out as runs of color, like
   "Row 1: White(x14) - Khaki(x1) - White(x15)". This is what you work from in
   advance, at home, counting dominoes into stacks days before anything is set
   up.

Both are printed from the **⋯** menu on the field's row in the sidebar, outside
of domino editing mode. Choose **Print Layout** or **Print Sort Plan**, set the
options, and press **Output for Print**. The plan opens in a new browser tab
with a **Print** button at the top — from there your browser's normal print
dialog will print it, or save it as a PDF.

The build plane itself has no build plan, since it holds no dominoes of its own.

## Templates and batches

Dominoes are usually set up with a *template* — a big comb, somewhere between 10
and 50 teeth wide. A row of dominoes is slotted into the teeth and slid into
place as one piece.

Both documents can mark where one template load ends and the next begins, so you
can count a template's worth of each color at a time. The Layout draws a thick
line at each boundary; the Sort Plan writes `||`. Each document has its own
setting for how wide the template is, because there is no reason you cannot sort
against one template and set up with another.

## The Layout

### Colors and numbers

Colors on paper are much harder to tell apart than colors on a screen, and two
similar colors in your inventory can look identical once printed. So every
domino carries a **number**, and the first page of the document is a legend
giving each number its color, its name, and how many of it you need — along with
the total for the whole field.

The numbers run from 1 upwards in the same order the domino inventory's **Color**
column sorts in, so a plan reprinted after a small change keeps most of its
numbering. Dominoes you have not coloured yet are numbered **0** and listed
first, so every number from 1 up is a colour you actually have to go and fetch.

Because the numbers matter, they are never shrunk to fit more on a page. Instead
it works the other way round: the smallest readable number decides how many
dominoes fit on a sheet.

### Plan dividers

-  **Major** divisions get a thick line, **minor** divisions a thin one.
-  Rows and dominoes are set separately, since they are different things — a
   major column division is usually one template wide.
-  Where a division falls exactly on the edge of a page, that edge is drawn with
   the division's own thick or thin line rather than a plain border. That is your
   sign that a template **stops here** and does not carry on to the next sheet.

### Pages

**Pagination** offers three ways to decide how much goes on a sheet:

-  **Paginate Automatically** works it out for you: it fits as much on a page as
   it can while keeping the numbers readable, then makes the dominoes as large as
   will fit without needing any extra pages. The result is shown in the summary
   at the bottom of the dialog.
-  **Paginate Manually** lets you set rows and dominoes per page yourself.
-  **Fit to Pages** lets you say how many pages wide and long you want, and sizes
   the dominoes to suit. Pages are then **filled from left to right** — as many
   dominoes on each sheet as will fit while still breaking where you asked, with
   the leftovers on the last page. So 86 dominoes over two pages come out 60 and
   26, not 43 and 43. You may end up with fewer pages than you asked for, which
   just means everything fitted in less.

With either of the last two, if what you ask for would print numbers too small to
read, the dialog says so and tells you what would fit — but it still prints
exactly what you asked for.

Dominoes are never printed larger than 8mm across, so a small field on a big
sheet does not turn into a handful of giant squares.

**Break rows on** and **Break columns on** control where a page is allowed to
end. Pages break on major divisions by default for columns, so a template is
never split across a page turn, and on either kind of division for rows.

Note that a field whose shape does not match the paper's will leave some empty
space on the page, and no amount of enlarging can remove it without spilling onto
another sheet. A roughly square field on landscape paper is the usual case —
switching to portrait, or using **Fit to Pages**, is the answer.

Every page is labelled with both its position and the dominoes on it, for
example:

    Page 1:2 — Rows 1-10, Columns 49-96

Dominoes are always the same size on every sheet, so pages can be laid out or
taped together and will line up.

## The Sort Plan

Rows are numbered from **1 at the top**, and read left to right — the same
numbering the Layout's page headers use.

Turn **Batching** on to break each row into template loads. The batch count
starts again at the beginning of every row, since a template is loaded one row at
a time. A run that crosses a boundary is split, with both halves keeping their
color name:

    Row 1: White(x14) - Khaki(x1) - White(x5) || White(x10) - Light Gray(x1) ...

Pages are worked out from how much text actually fits, and a row is never split
across a page.

## Hidden dominoes

A hidden domino means no domino stands in that spot. In the Layout it is drawn as
an empty cell, so you can see the hole in the grid. In the Sort Plan it is
written as `skip` — lowercase, so it never reads as a color name.

Gaps count as slots when batching, because an empty tooth is still a tooth on the
template.

## Unassigned dominoes

Dominoes you have not given a color yet are printed as a color called
**Unassigned**, in the same grey they show on the build plane, numbered **0** and
listed first in the legend. They are counted like any other color, so a field you
are only part way through still prints a complete, usable plan — and the numbers
from 1 up are exactly the colors you need to have on hand.
