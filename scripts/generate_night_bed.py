"""Render the original K-TV horror-news bed as a loopable mono WAV."""

from array import array
import math
import random
import wave

RATE = 22_050
DURATION = 52.0
TOTAL = int(RATE * DURATION)
OUT = "public/night-bed.wav"
rng = random.Random(1987)
mix = array("f", [0.0]) * TOTAL


def add_bell(start: float, frequency: float, length: float = 4.6, level: float = 0.16) -> None:
    begin = int(start * RATE)
    count = min(int(length * RATE), TOTAL - begin)
    partials = ((1.0, 1.0), (2.01, 0.42), (3.97, 0.19), (6.13, 0.08))
    for index in range(max(0, count)):
        t = index / RATE
        attack = min(1.0, t / 0.018)
        decay = math.exp(-t / 1.65)
        value = sum(weight * math.sin(2 * math.pi * frequency * ratio * t) for ratio, weight in partials)
        mix[begin + index] += value * attack * decay * level


def add_reverse_swell(end: float, frequency: float, length: float = 2.8, level: float = 0.11) -> None:
    begin = max(0, int((end - length) * RATE))
    count = min(int(length * RATE), TOTAL - begin)
    phase = 0.0
    for index in range(count):
        t = index / RATE
        progress = t / length
        phase += 2 * math.pi * (frequency * (0.72 + progress * 0.66)) / RATE
        envelope = progress ** 2.8
        rasp = (rng.random() * 2 - 1) * 0.23
        mix[begin + index] += (math.sin(phase) + rasp) * envelope * level


def add_low_impact(start: float, level: float = 0.31) -> None:
    begin = int(start * RATE)
    count = min(int(2.4 * RATE), TOTAL - begin)
    phase = 0.0
    for index in range(max(0, count)):
        t = index / RATE
        frequency = 47.0 * math.exp(-t * 0.31)
        phase += 2 * math.pi * frequency / RATE
        envelope = math.exp(-t / 0.72)
        mix[begin + index] += math.sin(phase) * envelope * level


def add_music_box(start: float, frequency: float, level: float = 0.24) -> None:
    """An old television interstitial melody, slightly detuned and mechanically uneven."""
    begin = int(start * RATE)
    count = min(int(5.2 * RATE), TOTAL - begin)
    for index in range(max(0, count)):
        t = index / RATE
        attack = min(1.0, t / 0.006)
        decay = math.exp(-t / 1.25)
        wobble = 1 + 0.0038 * math.sin(2 * math.pi * 2.7 * t)
        fundamental = math.sin(2 * math.pi * frequency * wobble * t)
        glass = 0.56 * math.sin(2 * math.pi * frequency * 2.997 * t + .42)
        wrong_partial = 0.31 * math.sin(2 * math.pi * frequency * 4.07 * t + 1.2)
        click = (rng.random() * 2 - 1) * math.exp(-t / .014) * .75
        mix[begin + index] += (fundamental + glass + wrong_partial + click) * attack * decay * level


def add_bowed_scrape(start: float, length: float = 4.8, level: float = 0.22) -> None:
    """A waterphone-like rise: recognisably musical, but with an unstable pitch centre."""
    begin = int(start * RATE)
    count = min(int(length * RATE), TOTAL - begin)
    phases = [0.0, 0.0, 0.0]
    for index in range(max(0, count)):
        t = index / RATE
        progress = t / length
        envelope = math.sin(math.pi * progress) ** 1.35
        value = 0.0
        for tone, base in enumerate((248.0, 263.2, 371.0)):
            unstable = base + 23 * progress + math.sin(2 * math.pi * (.37 + tone * .11) * t) * (3.8 + 4 * progress)
            phases[tone] += 2 * math.pi * unstable / RATE
            value += math.sin(phases[tone]) * (0.55 if tone == 0 else 0.27)
        bow = (rng.random() * 2 - 1) * .18
        mix[begin + index] += (value + bow) * envelope * level


def add_tape_stop(start: float, level: float = 0.27) -> None:
    begin = int(start * RATE)
    length = 1.6
    count = min(int(length * RATE), TOTAL - begin)
    phase = 0.0
    for index in range(max(0, count)):
        t = index / RATE
        progress = t / length
        frequency = 410 * (1 - progress) ** 2 + 34
        phase += 2 * math.pi * frequency / RATE
        envelope = math.sin(math.pi * progress) * (1 - progress * .4)
        mix[begin + index] += math.sin(phase) * envelope * level


# Bowed low cluster: a root, minor second, and tritone that beat against one another.
phases = [0.0, 0.0, 0.0, 0.0]
frequencies = [43.65, 46.25, 65.41, 69.30]
for index in range(TOTAL):
    t = index / RATE
    slow_breath = 0.62 + 0.25 * math.sin(2 * math.pi * 0.071 * t) + 0.12 * math.sin(2 * math.pi * 0.113 * t)
    value = 0.0
    for tone, frequency in enumerate(frequencies):
        phases[tone] += 2 * math.pi * (frequency + math.sin(2 * math.pi * (0.037 + tone * 0.009) * t) * 0.13) / RATE
        value += math.sin(phases[tone]) * (0.31 if tone == 0 else 0.12)
    # Very quiet room tone, deliberately secondary to the musical material.
    room = (rng.random() * 2 - 1) * 0.008
    mix[index] += value * slow_breath * 0.29 + room

# A simple five-note station ident returns in damaged variations. It is sparse
# enough to create silence, but melodic enough not to read as generic noise.
for when, note in (
    (1.4, 523.25), (2.12, 493.88), (3.06, 369.99), (4.42, 415.30), (5.35, 311.13),
    (18.6, 523.25), (19.39, 493.88), (20.44, 349.23), (21.96, 415.30), (23.05, 293.66),
    (38.9, 493.88), (39.71, 466.16), (40.75, 349.23), (42.28, 392.00), (43.42, 277.18),
):
    add_music_box(when, note)

# The old broadcast bell remains underneath only at a few transition points.
for when, note in ((9.8, 311.13), (10.42, 293.66), (31.3, 349.23), (32.0, 329.63)):
    add_bell(when, note, level=.11)

for end, note in ((9.8, 174.61), (18.6, 138.59), (31.3, 164.81), (43.2, 116.54)):
    add_reverse_swell(end, note)

for when in (13.7, 26.4, 39.2, 48.0):
    add_low_impact(when)

add_bowed_scrape(10.7, 4.7, .25)
add_bowed_scrape(27.5, 5.9, .29)
add_bowed_scrape(45.0, 4.2, .23)
add_tape_stop(16.1)
add_tape_stop(35.2, .31)

# Headroom, soft tape saturation, and a quiet seam at the loop boundary.
for index in range(TOTAL):
    t = index / RATE
    seam = min(1.0, t / 1.4, (DURATION - t) / 1.8)
    mix[index] = math.tanh(mix[index] * 1.35) * 0.76 * max(0.0, seam)

pcm = array("h", (max(-32767, min(32767, int(sample * 32767))) for sample in mix))
with wave.open(OUT, "wb") as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(RATE)
    output.writeframes(pcm.tobytes())

print(OUT)
