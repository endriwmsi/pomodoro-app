-- As estatísticas agrupam as sessões pelo instante em que terminaram.
CREATE INDEX idx_pomodoro_sessions_ended_at ON pomodoro_sessions (ended_at_ms);

-- "Tarefas concluídas hoje" consulta pela data de conclusão.
CREATE INDEX idx_tasks_completed_at ON tasks (completed_at_ms);
