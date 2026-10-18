### Results: mock mode (scripted mock agent)

| Metric | Value |
|---|---|
| Correct answers | **29/30 (97%)** |
| Answers with a hallucination | **0/30 (0%)** |

| Question type | Correct |
|---|---|
| search | 10/10 |
| semantic | 3/3 |
| details | 3/3 |
| compare | 2/2 |
| cart | 3/3 |
| no_result | 2/2 |
| unsupported | 2/2 |
| off_topic | 4/4 |
| trap | 0/1 |

Retrieval benchmark (11 search questions, raw text only, top 5):

| Search mode | Precision@5 | Hit@5 |
|---|---|---|
| keyword | 69% | 91% |
| semantic | 42% | 82% |
| hybrid | 56% | 82% |

Failed cases:

- `trap-01`: answer should match /(don'?t|do not|doesn'?t|does not) (have|include|list|mention|contain)|no (information|warranty (info|details|data))|not (available|listed|specified|provided|included)|unable/
