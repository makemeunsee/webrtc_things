package util;

public class UnorderedPair<A,B> {

    public final A a;
    public final B b;

    private UnorderedPair(A _a, B _b) {
        a = _a;
        b = _b;
    }

    public static <A, B> UnorderedPair<A, B> pair(A _a, B _b) {
        return new UnorderedPair<A, B>(_a, _b);
    }

    @Override
    public int hashCode() {
        return (a == null ? 0 : a.hashCode()) + (b == null ? 0 : b.hashCode());
    }

    @Override
    public boolean equals(final Object o) {
        if(o instanceof UnorderedPair) {
            UnorderedPair<?, ?> p = (UnorderedPair<?, ?>) o;
            return ((a == p.a || a != null && a.equals(p.a)) &&
                    (b == p.b || b != null && b.equals(p.b))) ||
                    ((a == p.b || a != null && a.equals(p.b)) &&
                            (b == p.a || b != null && b.equals(p.a)));
        }
        return false;
    }

}


