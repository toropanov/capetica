import { useMemo, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/gameStore';
import Card from '../components/Card';
import ProfessionCard from '../components/ProfessionCard';
import styles from './ProfessionSelect.module.css';
import { DIFFICULTY_OPTIONS, summarizeGoal } from '../utils/goals';

function CharacterSelect() {
  const navigate = useNavigate();
  const professions = useGameStore((state) => state.configs?.professions?.professions || []);
  const selectProfession = useGameStore((state) => state.selectProfession);
  const selectedGoalId = useGameStore((state) => state.selectedGoalId);
  const difficulty = useGameStore((state) => state.difficulty);
  const currentProfessionId = useGameStore((state) => state.professionId);
  const markSettingsDirty = useGameStore((state) => state.markSettingsDirty);
  const clearSettingsDirty = useGameStore((state) => state.clearSettingsDirty);
  const transitionState = useGameStore((state) => state.transitionState);
  const beginTransition = useGameStore((state) => state.beginTransition);
  const [pendingProfessionId, setPendingProfessionId] = useState(currentProfessionId);
  const [pendingGoalId, setPendingGoalId] = useState(selectedGoalId);
  const [pendingDifficulty, setPendingDifficulty] = useState(difficulty);
  const [saving, setSaving] = useState(false);
  const pageRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const winRules = useGameStore((state) => state.configs?.rules?.win || []);

  const orderedProfessions = useMemo(() => [...professions].sort((a, b) => a.salaryMonthly - b.salaryMonthly), [professions]);

  const goalButtons = useMemo(
    () =>
      winRules.map((rule) => {
        const summary = summarizeGoal(rule);
        return {
          id: rule.id,
          label: summary.title,
          detail: summary.detail,
        };
      }),
    [winRules],
  );

  useEffect(() => {
    setPendingGoalId(selectedGoalId);
  }, [selectedGoalId]);

  useEffect(() => {
    setPendingDifficulty(difficulty);
  }, [difficulty]);

  useEffect(() => {
    setPendingProfessionId(currentProfessionId);
  }, [currentProfessionId]);

  useLayoutEffect(() => {
    pageRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const hasPendingChanges =
    pendingProfessionId !== currentProfessionId ||
    pendingGoalId !== selectedGoalId ||
    pendingDifficulty !== difficulty;

  useEffect(() => {
    if (hasPendingChanges) {
      markSettingsDirty();
    } else {
      clearSettingsDirty();
    }
  }, [hasPendingChanges, markSettingsDirty, clearSettingsDirty]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  const handleSelect = (professionId) => {
    setPendingProfessionId(professionId);
  };

  const handleSave = () => {
    if (!pendingProfessionId || saving || transitionState !== 'idle') return;
    setSaving(true);
    beginTransition('Сохраняем настройки...');
    selectProfession(pendingProfessionId, {
      goalId: pendingGoalId || selectedGoalId,
      difficulty: pendingDifficulty || difficulty,
    });
    saveTimeoutRef.current = setTimeout(() => {
      setSaving(false);
      navigate('/');
      saveTimeoutRef.current = null;
    }, 500);
  };

  const saveDisabled = !pendingProfessionId || saving;

  return (
    <div className={styles.selectionPage}>
      <div ref={pageRef} className={styles.selectionContent}>
        <Card className={`${styles.panelCard} ${styles.strategyCard}`}>
          <div className={styles.sectionHeader}>
            <h2>Стратегия партии</h2>
          </div>
          <div className={styles.optionListCenter}>
            {goalButtons.map((rule) => (
              <button
                key={rule.id}
                type="button"
                className={`${styles.optionButton} ${pendingGoalId === rule.id ? styles.optionButtonActive : ''}`}
                onClick={() => setPendingGoalId(rule.id)}
              >
                <strong>{rule.label}</strong>
                <small>{rule.detail}</small>
              </button>
            ))}
          </div>
        </Card>
        <Card className={styles.panelCard}>
          <div className={styles.sectionHeader}>
            <h2>Сложность</h2>
          </div>
          <div className={styles.optionListCenter}>
            {DIFFICULTY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`${styles.optionButton} ${pendingDifficulty === option.id ? styles.optionButtonActive : ''}`}
                onClick={() => setPendingDifficulty(option.id)}
              >
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
        </Card>
        <div className={styles.characterGrid}>
          {orderedProfessions.map((profession) => (
            <ProfessionCard
              key={profession.id}
              profession={profession}
              isSelected={pendingProfessionId === profession.id}
              onSelect={() => handleSelect(profession.id)}
            />
          ))}
        </div>
      </div>
      <div className={styles.diceSection}>
        <button
          type="button"
          className={`${styles.heroButton} ${styles.heroContinue} ${styles.settingsSaveButton}`}
          onClick={handleSave}
          disabled={saveDisabled}
        >
          <span>{saving ? 'Сохраняем...' : 'Сохранить'}</span>
        </button>
        <div className={styles.diceBottomGap} />
      </div>
    </div>
  );
}

export default CharacterSelect;
