interface ChatChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
}

export class StreamParser {
  private buffer = "";
  private done = false;

  push(chunk: string): string[] {
    if (this.done) {
      return [];
    }

    this.buffer += chunk;
    const deltas: string[] = [];
    let boundary = this.buffer.indexOf("\n\n");

    while (boundary >= 0) {
      const event = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      deltas.push(...this.parseEvent(event));
      boundary = this.buffer.indexOf("\n\n");
    }

    return deltas;
  }

  flush(): string[] {
    if (this.done || !this.buffer.trim()) {
      this.buffer = "";
      return [];
    }
    const event = this.buffer;
    this.buffer = "";
    return this.parseEvent(event);
  }

  private parseEvent(event: string): string[] {
    const dataLines = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());

    const deltas: string[] = [];
    for (const data of dataLines) {
      if (data === "[DONE]") {
        this.done = true;
        continue;
      }
      try {
        const payload = JSON.parse(data) as ChatChunk;
        const delta = payload.choices?.[0]?.delta?.content;
        if (delta) {
          deltas.push(delta);
        }
      } catch {
        // Ignore malformed SSE frames; the next complete frame can still be used.
      }
    }
    return deltas;
  }
}
