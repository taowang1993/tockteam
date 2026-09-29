# Migration Diagrams

## Flowchart
```Mermaid
flowchart LR
  A[Start] --> B[Finish]
```

## Sequence
```mermaid
sequenceDiagram
  Alice->>Bob: Hello
```

## Class
```mermaid
classDiagram
  class Animal {
    +name string
  }
```

## State
```mermaid
stateDiagram-v2
  [*] --> Active
  Active --> [*]
```

## Relationship
```mermaid
erDiagram
  USER ||--o{ ORDER : places
```

## Pie
```mermaid
pie showData
  title Pets
  "Cats" : 40
  "Dogs" : 60
```

## Gantt
```mermaid
gantt
  title Plan
  dateFormat YYYY-MM-DD
  section First
  Task A :a1, 2026-01-01, 1d
```

## Hostile Link (Must Remain Text)
```mermaid
flowchart LR
  A --> B
  click A "https://outside.invalid/attempt"
```
