"""Hand-authored Shantell Sans companion glyphs. Requires Skia and fontTools.
Coordinates are font units, y upward. Final SVGs contain only filled outlines.
Components come exclusively from the supplied Shantell Sans font.
"""
from pathlib import Path
import csv, json, math, re, shutil, unicodedata, hashlib
import xml.etree.ElementTree as ET
import skia
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.svgLib.path import parse_path
from PIL import Image, ImageDraw, ImageFont
OUT=Path(__file__).parent
SOURCE=Path('/Users/noahbjorner/Developer/Edu/edu_experiments/projects/sixtus/tools/learning-material/whiteboard/render/fonts')
FONT=TTFont(SOURCE/'ShantellSans-Medium.woff2');GS=FONT.getGlyphSet();CMAP=FONT.getBestCmap()
BASELINE=1020;CANVAS=1400
for directory in ['svg','reference','previews']:(OUT/directory).mkdir(exist_ok=True)
class SkiaPen(BasePen):
    def __init__(self,glyphSet=None):super().__init__(glyphSet);self.path=skia.Path()
    def _moveTo(self,p):self.path.moveTo(*p)
    def _lineTo(self,p):self.path.lineTo(*p)
    def _curveToOne(self,a,b,c):self.path.cubicTo(*a,*b,*c)
    def _qCurveToOne(self,a,b):self.path.quadTo(*a,*b)
    def _closePath(self):self.path.close()
    def _endPath(self):pass

def path(d):
    p=SkiaPen();parse_path(d,p);return p.path

def stroke(d,width=98):
    paint=skia.Paint(Style=skia.Paint.kStroke_Style,StrokeWidth=width,StrokeCap=skia.Paint.kRound_Cap,StrokeJoin=skia.Paint.kRound_Join)
    result=skia.Path();paint.getFillPath(path(d),result,resScale=4);return result

def transform(p,sx=1,sy=1,dx=0,dy=0,skew=0):
    q=skia.Path(p);q.transform(skia.Matrix.MakeAll(sx,skew,dx,0,sy,dy,0,0,1));return q

def union(*parts):
    result=skia.Path(parts[0])
    for p in parts[1:]:result=skia.Op(result,p,skia.PathOp.kUnion_PathOp)
    return skia.AsWinding(skia.Simplify(result))

def glyph(c,**kw):
    p=SkiaPen(GS);GS[CMAP[ord(c)]].draw(p);return transform(p.path,**kw)

def fit_path(p,x,y,w,h):
    b=p.computeTightBounds();return transform(p,sx=w/b.width(),sy=h/b.height(),dx=x-b.left()*w/b.width(),dy=y-b.top()*h/b.height())

def fitted(c,x,y,w,h):return fit_path(glyph(c),x,y,w,h)

def oval(x,y,w,h,width=98):
    return stroke(f'M {x+w*.51} {y+h} C {x+w*.15} {y+h*1.02} {x-w*.025} {y+h*.75} {x} {y+h*.42} C {x+w*.015} {y+h*.1} {x+w*.2} {y-h*.025} {x+w*.5} {y} C {x+w*.84} {y-h*.015} {x+w*1.01} {y+h*.21} {x+w} {y+h*.55} C {x+w*.985} {y+h*.87} {x+w*.78} {y+h*1.015} {x+w*.51} {y+h} Z',width)

def rule(x1,y1,x2,y2,width=98):
    dx=x2-x1;dy=y2-y1
    return stroke(f'M {x1} {y1} C {x1+dx*.32-dy*.012} {y1+dy*.32+dx*.012} {x1+dx*.68+dy*.008} {y1+dy*.68-dx*.008} {x2} {y2}',width)

def dot(x,y,r=50):return fitted('·',x-r,y-r,r*2,r*2)
G={}
def add(c,p,advance,method,refs=''):
    assert c not in G and ord(c) not in CMAP,c
    G[c]={'path':union(p),'advance':advance,'method':method,'references':refs}

# Lowercase Greek: native 497-unit x-height and approximately -250 descenders.
add('α',union(stroke('M 468 426 C 407 487 274 503 180 433 C 74 355 63 179 141 95 C 217 14 350 54 426 169 C 474 248 492 351 486 451',97),stroke('M 482 451 C 474 340 455 201 488 108 C 507 56 537 40 580 58',99)),640,'Looping alpha with a crossed right exit.','a, o')
add('β',union(stroke('M 126 -213 C 119 -13 119 235 143 450 C 154 578 187 676 272 688 C 364 702 435 637 428 550 C 424 470 346 400 217 366',96),stroke('M 215 366 C 366 437 512 350 510 215 C 508 82 367 10 178 70',96)),590,'Tall beta, two bowls, descending stem.','B, p')
add('γ',stroke('M 90 449 C 156 444 221 358 270 239 C 319 127 320 -85 315 -205 M 517 454 C 488 355 402 191 315 87',98),610,'Open-fork gamma with descender.','y')
add('δ',union(oval(109,43,388,399,96),stroke('M 453 466 C 394 564 269 606 239 665 C 225 704 274 729 370 698',94)),610,'Delta bowl with curled ascender.','o, partialdiff')
add('ε',stroke('M 458 423 C 365 477 179 477 132 390 C 90 313 179 256 331 262 M 331 262 C 176 266 86 204 118 124 C 150 39 352 25 469 97',98),570,'Open two-lobed epsilon.','e')
add('ζ',stroke('M 143 674 C 266 650 390 658 471 687 C 437 609 336 538 233 439 C 109 321 71 204 150 130 C 230 52 406 112 434 9 C 453 -67 387 -160 316 -205',96),565,'Zeta with descending terminal loop.','z, g')
add('η',union(stroke('M 112 450 C 117 330 115 165 112 42',99),stroke('M 121 275 C 171 421 296 507 408 441 C 504 386 476 262 476 95 C 475 -22 475 -127 482 -206',98)),595,'Eta arch with descending right stem.','n')
add('θ',union(oval(111,39,378,624,96),rule(123,337,470,350,90)),600,'Narrow oval theta with interior crossbar.','O, o')
add('ι',glyph('ı'),FONT['hmtx'][CMAP[ord('ı')]][0],'Native dotless i outline reused for iota.','dotlessi')
add('κ',union(rule(121,452,116,42,99),stroke('M 456 447 C 361 355 263 266 129 217 M 285 285 C 356 212 419 98 499 46',97)),585,'X-height kappa with open arms.','k')
add('λ',stroke('M 142 690 C 236 688 272 588 318 457 C 378 286 430 98 510 44 M 319 436 C 253 293 191 147 108 44',98),610,'Lambda with curved ascending lead-in.','A, y')
add('μ',union(stroke('M 122 452 C 121 287 125 94 113 -214',98),stroke('M 127 270 C 131 141 161 52 257 46 C 370 38 444 143 460 284 M 462 449 C 462 316 442 156 483 84 C 502 48 531 37 568 53',98)),650,'Mu with left descender and rounded u bowl.','u, p')
add('ν',glyph('v'),FONT['hmtx'][CMAP[ord('v')]][0],'Native handwritten v outline reused for nu.','v')
add('ξ',stroke('M 472 693 C 358 714 209 704 186 619 C 162 534 267 491 413 502 M 413 502 C 265 514 120 434 133 344 C 145 263 259 239 387 259 M 387 259 C 244 259 120 181 148 95 C 173 18 327 59 397 -5 C 454 -57 424 -134 357 -202',96),570,'Xi with three curved levels and descender.','e, z')
add('ο',glyph('o'),FONT['hmtx'][CMAP[ord('o')]][0],'Native o reused for omicron.','o')
add('ρ',glyph('p'),FONT['hmtx'][CMAP[ord('p')]][0],'Native p reused for upright rho.','p')
add('σ',union(oval(104,44,370,385,96),stroke('M 287 446 C 386 457 489 463 562 454',94)),640,'Sigma bowl with projecting upper arm.','o, pi')
add('τ',union(rule(82,449,531,455,101),stroke('M 296 445 C 288 333 277 198 288 102 C 294 55 327 30 379 56',99)),610,'Tau with pi-like top and curved foot.','pi, t')
add('υ',glyph('u'),FONT['hmtx'][CMAP[ord('u')]][0],'Native rounded u outline reused for upright upsilon.','u')
add('φ',union(stroke('M 325 505 C 265 470 251 392 258 276 C 265 128 289 -45 278 -215',94),stroke('M 165 422 C 91 355 85 222 142 128 C 205 23 399 25 489 110 C 570 190 545 350 454 416 C 402 454 350 445 316 412',96)),640,'Open-top looped phi, distinct from straight-stem phi symbol.','o, f')
add('χ',stroke('M 118 461 C 225 343 340 156 480 -201 M 491 455 C 392 268 269 87 122 -207',98),610,'Crossing chi with descenders.','x')
add('ψ',union(stroke('M 113 450 C 102 319 111 168 228 113 C 304 74 410 104 461 172 C 508 236 509 356 499 453',96),rule(304,548,305,-214,97)),615,'Psi bowl with descending central stem.','u')
add('ω',stroke('M 151 449 C 53 315 92 59 226 45 C 325 33 350 149 335 273 C 318 119 368 40 457 49 C 589 63 617 320 532 453',99),690,'Rounded double-bowl omega.','w, u')

# Capital Greek: native 700-unit cap height.
add('Γ',union(rule(127,49,124,652,104),rule(124,652,558,666,104)),650,'Gamma with rounded corner.','L, E')
add('Δ',stroke('M 107 52 C 188 252 279 462 363 658 C 465 463 560 235 632 45 C 454 34 278 48 107 52 Z',100),740,'Triangular delta with asymmetric sides.','A')
add('Θ',union(glyph('O'),rule(166,342,562,361,91)),727,'Native capital O plus internal bar.','O')
add('Λ',stroke('M 93 43 C 179 262 268 466 362 660 C 451 446 558 217 639 46',103),735,'Capital lambda with native A proportions.','A')
add('Ξ',union(rule(121,654,559,665,108),rule(170,351,526,358,103),rule(112,48,572,50,109)),680,'Three-bar xi, shorter middle bar.','E')
add('Π',union(rule(126,46,124,655,103),rule(565,44,558,662,103),rule(87,657,610,667,105)),700,'Capital pi without product descenders.','product')
add('Σ',fitted('∑',65,-10,560,720),700,'Native summation adapted to cap height.','summation')
add('Υ',glyph('Y'),FONT['hmtx'][CMAP[ord('Y')]][0],'Native Y reused for capital upsilon.','Y')
add('Φ',union(oval(108,145,489,411,98),rule(352,672,350,40,103)),710,'Capital phi with centered vertical stem.','O')
add('Ψ',union(stroke('M 118 661 C 112 493 119 336 261 291 C 356 257 480 294 533 376 C 570 440 571 556 564 661',103),rule(339,660,339,39,105)),700,'Capital psi with raised bowl.','U, Y')

# Variants are deliberately distinguished from base letters.
add('ϵ',union(stroke('M 489 430 C 377 481 185 464 139 339 C 86 198 159 56 306 46 C 375 39 444 58 491 86',97),rule(143,260,444,265,92)),590,'Lunate epsilon: C-shaped bowl and middle bar.','C, e')
add('ϑ',stroke('M 116 319 C 232 265 407 262 459 367 C 492 433 465 553 416 629 C 365 708 279 719 247 645 C 207 550 272 374 337 271 C 396 177 386 74 292 49 C 174 19 91 114 115 207',96),585,'Script theta with upper loop and lower bowl.','o, partialdiff')
add('ϰ',stroke('M 162 449 C 182 342 173 177 131 50 M 171 270 C 276 286 385 352 445 446 M 178 267 C 320 255 317 46 462 45 C 491 44 511 50 530 65',97),615,'Curved kappa variant with sweeping lower arm.','k')
add('ϕ',union(oval(105,45,407,395,96),rule(309,692,308,-215,97)),620,'Straight-stem phi symbol, closed bowl, ascender and descender.','o')
add('ϱ',stroke('M 128 -211 C 141 -91 145 32 137 163 C 129 309 158 455 309 454 C 456 453 534 309 491 179 C 455 69 339 53 253 104 C 204 135 182 169 171 217 M 140 93 C 162 -21 198 -106 279 -134 C 339 -155 387 -139 421 -107',96),610,'Rho symbol with curling descending return.','p, g')
add('ς',stroke('M 480 429 C 367 489 207 457 149 351 C 93 248 155 144 275 115 C 387 87 477 30 445 -60 C 420 -134 332 -178 260 -204',98),585,'Final sigma with open bowl and descending hook.','s')
add('ϖ',union(stroke('M 81 456 C 245 468 451 449 639 464',98),stroke('M 157 448 C 91 306 111 70 250 46 C 340 29 371 154 353 267 C 346 112 390 32 483 50 C 608 71 637 311 569 455',96)),735,'Pi symbol: omega-like bowl beneath top bar.','pi, w')
# Operators and calculus.
add('∓',transform(glyph('±'),sy=-1,dy=650),700,'Vertical reflection of native plus-minus.','plusminus')
add('∗',fitted('*',139,144,417,405),700,'Native asterisk centered on math axis.','asterisk')
add('∘',fitted('◦',212,207,272,272),700,'Native open bullet sized as composition operator.','openbullet')
add('∬',union(glyph('∫',dx=70),glyph('∫',dx=410)),1000,'Two native integral outlines.','integral')
add('∭',union(glyph('∫',dx=70),glyph('∫',dx=410),glyph('∫',dx=750)),1340,'Three native integral outlines.','integral')
add('∮',union(glyph('∫',dx=100),oval(227,165,307,325,77)),680,'Native integral with closed contour loop.','integral, o')
add('∇',stroke('M 109 650 C 279 661 453 658 620 655 C 537 457 441 247 361 44 C 270 251 182 460 109 650 Z',100),730,'Inverted delta for nabla.','A, delta')
wave=stroke('M 112 437 C 174 514 231 509 305 455 C 378 401 446 390 560 479',103)
add('≃',union(wave,rule(115,165,572,169,105)),700,'Tilde above one equality bar.','approxequal, minus')
add('≅',union(transform(wave,dy=120),rule(115,277,572,281,102),rule(113,92,573,96,102)),700,'Tilde above two equality bars.','approxequal, equal')
add('≡',union(rule(119,554,574,556,104),rule(119,342,574,350,103),rule(118,139,577,141,104)),700,'Three native-weight equality bars.','equal')
add('≪',union(fitted('<',64,80,418,468),fitted('<',426,80,418,468)),920,'Two native less-than outlines.','less')
add('≫',union(fitted('>',64,80,418,468),fitted('>',426,80,418,468)),920,'Two native greater-than outlines.','greater')
add('∝',stroke('M 668 520 C 578 563 482 476 391 331 C 304 187 221 120 137 190 C 49 264 66 420 163 462 C 253 501 339 407 414 291 C 506 157 589 139 671 182',104),780,'Open-right infinity form for proportionality.','infinity')
add('≔',union(dot(132,438,48),dot(134,207,48),fitted('=',252,139,478,386)),815,'Native dots alongside native equals.','periodcentered, equal')
# Sets and logic.
member=stroke('M 550 560 C 375 578 148 534 134 343 C 120 158 340 98 554 125 M 138 342 C 270 345 411 347 545 349',103)
subset=stroke('M 549 560 C 350 581 129 528 129 341 C 129 158 334 100 551 124',104)
slash=rule(213,57,493,636,85)
add('∈',member,700,'Curved membership sign with middle bar.','C, equal')
add('∉',union(member,slash),700,'Membership sign with negating slash.','element-of')
add('∋',transform(member,sx=-1,dx=700),700,'Reflected membership sign.','element-of')
add('⊂',subset,700,'Open-right subset curve.','C')
add('⊃',transform(subset,sx=-1,dx=700),700,'Reflected subset curve.','subset-of')
add('⊆',union(fit_path(subset,77,238,526,392),rule(116,72,564,75,103)),700,'Subset curve above equality bar.','subset-of, minus')
add('⊇',transform(G['⊆']['path'],sx=-1,dx=700),700,'Reflected subset-or-equal sign.','subset-of-or-equal-to')
add('∪',stroke('M 137 599 C 140 419 115 157 269 111 C 363 82 493 111 534 213 C 570 304 550 473 558 603',106),700,'Broad U-shaped union.','U')
add('∩',transform(G['∪']['path'],sy=-1,dy=700),700,'Reflected union for intersection.','union')
add('∖',rule(168,616,524,76,102),700,'Descending set-minus slash.','backslash')
add('∀',transform(glyph('A'),sx=-1,sy=-1,dx=740,dy=700),740,'Native A rotated half a turn.','A')
add('∃',transform(glyph('E'),sx=-1,dx=639),639,'Native E reflected horizontally.','E')
add('∄',union(G['∃']['path'],rule(168,-13,486,711,87)),660,'Native-derived exists plus negation slash.','E, exists')
add('∧',stroke('M 114 102 C 188 266 264 433 345 598 C 419 433 504 257 582 103',106),700,'Logical wedge with rounded vertex.','A')
add('∨',transform(G['∧']['path'],sy=-1,dy=700),700,'Reflected logical wedge.','logical-and')
ring=oval(94,55,521,535,92)
add('⊕',union(ring,rule(352,189,357,455,83),rule(224,319,491,327,83)),710,'Enclosing ring with inset plus.','o, plus')
add('⊗',union(ring,rule(253,219,460,432,83),rule(254,432,461,221,83)),710,'Enclosing ring with inset cross.','o, multiply')
# Arrows.
def double_arrow(both=False):
    start=146 if both else 117;end=680 if both else 611
    return union(rule(start,253,end+125,259,83),rule(start,449,end+125,455,83),stroke(f'M {end-41} 607 C {end+61} 550 {end+168} 434 {end+214} 354 C {end+143} 249 {end+50} 151 {end-39} 104',92),*([stroke('M 319 607 C 214 550 110 434 63 354 C 135 249 227 151 317 104',92)] if both else []))
add('⇒',double_arrow(),920,'Double shaft with open arrowhead.','arrowright')
add('⇐',transform(G['⇒']['path'],sx=-1,dx=920),920,'Reflected double arrow.','rightwards-double-arrow')
add('⇔',double_arrow(True),995,'Double-headed double arrow.','arrowboth')
add('↦',union(glyph('→',dx=160),rule(132,154,137,561,99),rule(136,355,231,355,98)),880,'Native arrow with starting bar.','arrowright')
# Floor and ceiling.
add('⌈',stroke('M 163 -211 C 153 85 162 455 158 759 C 218 765 303 770 389 767',106),490,'Left ceiling matching native bracket extents.','bracketleft')
add('⌉',transform(G['⌈']['path'],sx=-1,dx=490),490,'Reflected ceiling.','left-ceiling')
add('⌊',transform(G['⌈']['path'],sy=-1,dy=550),490,'Vertically reflected ceiling for floor.','left-ceiling')
add('⌋',transform(G['⌊']['path'],sx=-1,dx=490),490,'Reflected floor.','left-floor')
# Dots and number sets.
add('⋯',union(dot(145,342),dot(350,342),dot(555,342)),700,'Three native dots on math axis.','periodcentered')
add('⋮',union(dot(195,110),dot(195,341),dot(195,572)),390,'Three native dots vertically.','periodcentered')
add('⋱',union(dot(145,572),dot(350,341),dot(555,110)),700,'Three native dots on descending diagonal.','periodcentered')
add('ℏ',union(glyph('h'),rule(51,580,313,625,75)),FONT['hmtx'][CMAP[ord('h')]][0]+8,'Native h with slanted upper-stem bar.','h')
add('ℝ',union(glyph('R',dx=122),rule(65,43,65,650,73),rule(65,650,230,655,70),rule(65,43,215,43,70)),850,'Native R with second left stem joined at its ends.','R')
add('ℕ',union(glyph('N',dx=122),rule(65,44,65,652,73),rule(65,652,249,655,70),rule(65,44,241,44,70)),FONT['hmtx'][CMAP[ord('N')]][0]+170,'Native N with second left stem joined at its ends.','N')
add('ℤ',union(rule(105,653,662,660,99),rule(109,46,668,51,101),stroke('M 556 649 C 414 461 266 240 109 48',97),stroke('M 668 648 C 529 459 380 237 222 50',68)),780,'Drawn Z with two distinct parallel diagonals and joined top/bottom bars.','Z')
add('ℚ',union(oval(195,45,440,610,98),stroke('M 413 655 C 232 707 89 571 87 367 C 84 160 216 16 413 45',68),rule(492,181,683,-28,102)),790,'Drawn Q with a separated double left bowl and diagonal tail.','Q, O')
add('ℂ',union(stroke('M 602 621 C 519 683 345 689 247 567 C 167 465 171 250 245 137 C 319 25 504 24 612 92',98),stroke('M 413 656 C 232 707 89 571 87 367 C 84 160 216 16 413 45',68)),750,'Drawn C with a separated parallel left arc.','C')
add('ℙ',union(glyph('P',dx=122),rule(65,44,65,652,73),rule(65,652,240,656,70),rule(65,44,230,44,70)),780,'Native P with second left stem joined at its ends.','P')
add('ℵ',union(stroke('M 128 653 C 267 474 432 284 575 48',104),stroke('M 576 657 C 572 492 489 404 374 388',102),stroke('M 136 43 C 123 206 194 302 315 324',103),rule(531,656,611,666,79),rule(91,42,176,39,79)),720,'Aleph with diagonal spine and opposing upper/lower arms.','X, N')
add('⊥',union(rule(347,643,351,97,106),rule(108,79,590,85,108)),700,'Perpendicular sign with centered stem.','T')
add('∥',union(rule(220,632,218,65,98),rule(477,632,477,65,98)),700,'Parallel sign with distinct vertical rules.','bar')
add('∠',stroke('M 553 594 C 422 447 270 259 116 104 C 285 98 448 99 608 102',104),720,'Angle with sloping ray and horizontal base.','less')

def to_d(p):
    """Standard SVG path commands, including quadratic approximations of conics."""
    commands=[];it=skia.Path.RawIter(p)
    def pt(p):return f'{p.x():.3f},{p.y():.3f}'
    while True:
        verb,points=it.next()
        if verb==skia.Path.kDone_Verb:break
        if verb==skia.Path.kMove_Verb:commands.append('M'+pt(points[0]))
        elif verb==skia.Path.kLine_Verb:commands.append('L'+pt(points[1]))
        elif verb==skia.Path.kQuad_Verb:commands.append('Q'+pt(points[1])+' '+pt(points[2]))
        elif verb==skia.Path.kCubic_Verb:commands.append('C'+' '.join(pt(p) for p in points[1:]))
        elif verb==skia.Path.kConic_Verb:
            q=skia.Path.ConvertConicToQuads(*points,it.conicWeight(),3)
            for i in range(1,len(q),2):commands.append('Q'+pt(q[i])+' '+pt(q[i+1]))
        elif verb==skia.Path.kClose_Verb:commands.append('Z')
    return ' '.join(commands)

def svg(p,label):
    d=to_d(transform(p,sy=-1,dy=BASELINE))
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{CANVAS}" height="{CANVAS}" viewBox="0 0 {CANVAS} {CANVAS}">\n<title>{label}</title>\n<path fill="#000000" fill-rule="nonzero" d="{d}"/>\n</svg>\n'

expected=re.findall(r'\| `uni[0-9A-F]+\.svg` \| (.) \|',(SOURCE/'missing-math-glyphs.md').read_text())
assert set(expected)==set(G),(set(expected)-set(G),set(G)-set(expected))
manifest=[]
for c in expected:
    e=G[c];cp=f'U+{ord(c):04X}';name=unicodedata.name(c)
    filename=f'{name.lower().replace(" ","-")}-u{ord(c):04x}.svg';e['filename']=filename
    b=e['path'].computeTightBounds()
    assert b.left()>=0 and b.right()<=CANVAS,(c,b)
    assert BASELINE-b.bottom()>=0 and BASELINE-b.top()<=CANVAS,(c,b)
    e['bounds']=[round(b.left(),3),round(b.top(),3),round(b.right(),3),round(b.bottom(),3)]
    (OUT/'svg'/filename).write_text(svg(e['path'],f'{cp} {name}'))
    manifest.append({'character':c,'unicode':cp,'name':name,'svg':'svg/'+filename,'advance_width':e['advance'],'font_bounds':e['bounds'],'design':e['method'],'source_components':e['references']})
(OUT/'manifest.json').write_text(json.dumps({'units_per_em':1000,'svg_canvas':1400,'svg_baseline_y':BASELINE,'source_sha256':hashlib.sha256((SOURCE/'ShantellSans-Medium.woff2').read_bytes()).hexdigest(),'glyphs':manifest},indent=2,ensure_ascii=False)+'\n')
with (OUT/'manifest.csv').open('w') as f:
    w=csv.writer(f);w.writerow(['character','unicode','svg','advance_width','x_min','y_min','x_max','y_max','design','source_components'])
    for m in manifest:w.writerow([m['character'],m['unicode'],m['svg'],m['advance_width'],*m['font_bounds'],m['design'],m['source_components']])
shutil.copyfile(SOURCE/'OFL.txt',OUT/'OFL.txt')
for c,n in [('o','reference-lowercase-o'),('A','reference-capital-a'),('∫','reference-integral'),('π','reference-pi')]:
    (OUT/'reference'/f'{n}.svg').write_text(svg(glyph(c),f'Original Shantell Sans {n}'))

# Uninstalled proof font: validate curves, Unicode mappings, spacing and counters.
proof=TTFont(SOURCE/'ShantellSans-Medium.woff2');proof.flavor=None
vmetrics=proof['vmtx'].metrics if 'vmtx' in proof else None
order=list(proof.getGlyphOrder())
for c,e in G.items():
    name=f'uni{ord(c):04X}';pen=TTGlyphPen(None)
    svg_d=ET.parse(OUT/'svg'/e['filename']).getroot().find('{http://www.w3.org/2000/svg}path').attrib['d']
    imported=transform(path(svg_d),sy=-1,dy=BASELINE)
    parse_path(to_d(imported),Cu2QuPen(pen,max_err=0.6,reverse_direction=False))
    tt_glyph=pen.glyph();tt_glyph.recalcBounds(proof['glyf'])
    proof['glyf'][name]=tt_glyph;proof['hmtx'][name]=(round(e['advance']),tt_glyph.xMin);order.append(name)
    if vmetrics is not None:vmetrics[name]=(1340,BASELINE-tt_glyph.yMax)
    for table in proof['cmap'].tables:
        if table.isUnicode():table.cmap[ord(c)]=name
proof.setGlyphOrder(order)
for platform,encoding,lang in [(3,1,0x409),(1,0,0)]:
    for nameid,val in [(1,'Whitespace Math Proof'),(2,'Medium'),(3,'Whitespace Math Proof 20260910'),(4,'Whitespace Math Proof Medium'),(6,'WhitespaceMathProof-Medium'),(16,'Whitespace Math Proof'),(17,'Medium')]:
        proof['name'].setName(val,nameid,platform,encoding,lang)
proof.save(OUT/'proof-only-not-installed.ttf')
reload=TTFont(OUT/'proof-only-not-installed.ttf')
assert set(map(ord,G)).issubset(reload.getBestCmap())
FONT.flavor=None;FONT.save(OUT/'reference'/'original-font.ttf')

label_font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',19)
small_font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',14)
heading_font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',30)
proof_path=str(OUT/'proof-only-not-installed.ttf')
ref_font=ImageFont.truetype(str(OUT/'reference'/'original-font.ttf'),44)
sections=[('01-greek-lowercase','Greek lowercase — new outlines',expected[:23]),('02-greek-capitals-variants','Greek capitals and variants — new outlines',expected[23:40]),('03-operators-relations','Operators and relations — new outlines',expected[40:54]),('04-sets-logic','Sets and logic — new outlines',expected[54:71]),('05-arrows-delimiters-extras','Arrows, brackets, and other notation — new outlines',expected[71:])]
for filename,title,chars in sections:
    cols=5;cw=270;ch=240;rows=math.ceil(len(chars)/cols)
    im=Image.new('RGB',(cols*cw+60,175+rows*ch),'#faf9f6');d=ImageDraw.Draw(im)
    d.text((30,22),title,font=heading_font,fill='#202020')
    d.text((30,76),'Native reference:  a o n x A B C R π Ω ∫ ∞',font=ref_font,fill='#4f575a')
    for i,c in enumerate(chars):
        x=30+(i%cols)*cw;y=158+(i//cols)*ch;e=G[c]
        d.rounded_rectangle((x,y,x+cw-14,y+ch-14),radius=12,fill='white',outline='#dfded9',width=1)
        d.line((x+15,y+130,x+cw-29,y+130),fill='#e4e8e6',width=1)
        size=min(88,int(215/e['advance']*1000));f=ImageFont.truetype(proof_path,size)
        advance=d.textlength(c,font=f)
        d.text((x+(cw-14-advance)/2,y+130),c,font=f,fill='#242626',anchor='ls')
        short=unicodedata.name(c).lower().replace('greek small letter ','').replace('greek capital letter ','capital ').replace('greek ','').replace('double-struck capital ','double-struck ')
        # Wrap captions so the proof labels never run into another cell.
        words=short.split();caption='';lines=[]
        for word in words:
            candidate=(caption+' '+word).strip()
            if d.textlength(candidate,font=label_font)>cw-40:lines.append(caption);caption=word
            else:caption=candidate
        lines.append(caption)
        for j,line in enumerate(lines):d.text((x+15,y+155+j*22),line,font=label_font,fill='#303538')
        d.text((x+15,y+205),f'U+{ord(c):04X}  ·  advance {e["advance"]}',font=small_font,fill='#788083')
    im.save(OUT/'previews'/f'{filename}.png')

im=Image.new('RGB',(1600,1100),'#faf9f6');d=ImageDraw.Draw(im)
d.text((40,24),'Whitespace Math — mixed-font proof',font=heading_font,fill='#242626')
lines=[('Greek alongside native letters','a α  b β  y γ  d δ  e ε  n η  o θ  k κ  u μ  p ρ  w ω'),('Capitals','A Γ Δ Θ Λ Ξ Π Σ Υ Φ Ψ Ω'),('Distinct Greek forms','ε ϵ   θ ϑ   κ ϰ   φ ϕ   ρ ϱ   σ ς   π ϖ'),('Set notation','x ∈ ℝ   A ⊆ B   A ∩ B = ∅   ∀x ∃y   P ⇒ Q'),('Calculus symbols','∇f   ∂f   ∫ f(x)   ∬ f(x,y)   ∭ f(x,y,z)   ∮ f(z)'),('Relations and geometry','a ≃ b   a ≅ b   a ≡ b   a ≪ b   a ∝ b   a ⊥ b   a ∥ b'),('Number sets','ℝ  ℕ  ℤ  ℚ  ℂ  ℙ  ℵ'),('Baseline and small-size check','αβγδεζηθικλμνξοπρστυφχψω  ∈∉⊆⊇  ⇐⇒⇔')]
for i,(label,txt) in enumerate(lines):
    y=85+i*122;d.text((40,y),label,font=label_font,fill='#717a7c')
    f=ImageFont.truetype(proof_path,45 if i==7 else 50)
    d.text((40,y+77),txt,font=f,fill='#242626',anchor='ls')
im.save(OUT/'previews'/'06-mixed-math-proof.png')
print(f'Created {len(G)} SVG outlines, manifests, original-font references, and 6 proof sheets in {OUT}')
